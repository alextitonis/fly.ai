import { useEffect, useRef, useState } from "react";
import { driver, type DriveStep } from "driver.js";
import { useFeatureTour } from "@/hooks/use-feature-tour";
import { useIsMobile } from "@/hooks/use-mobile";
import { FeatureTourWelcomeModal } from "@/components/feature-tour-welcome-modal";
import {
  trackOnboardingModalShown,
  trackOnboardingModalSkipped,
  trackOnboardingTourStarted,
  trackOnboardingStepViewed,
  trackOnboardingStepAdvanced,
  trackOnboardingTourSkipped,
  trackOnboardingTourCompleted,
  trackOnboardingSuppressedMobile,
} from "@/lib/analytics";

const DESKTOP_BREAKPOINT = 1023.5;
const TIGHT_POPOVER_CLASS = "shit-tour-popover shit-tour-popover-tight";
const NEW_BADGE = `<span class="px-1.25 pt-px mx-[3px] rounded-full bg-green/20 text-[8px] font-semibold text-green uppercase inline-flex items-center justify-center align-middle relative -top-px">NEW</span>`;

type SHITStep = DriveStep & { name: string };

function buildSteps(): SHITStep[] {
  return [
    {
      name: "sidebar_overview",
      element: '[data-tour="sidebar-nav"]',
      popover: {
        title: "Everything starts here",
        description: `
          <ul>
            <li><strong>Pulse</strong>${NEW_BADGE}. Live revenue, treasury health, buyback and emission activity, and every on-chain action.</li>
            <li><strong>SHIT.</strong> Balances, wrapping (previously Stake), bridging across chains.</li>
            <li><strong>Cooler.</strong> Borrow USDS against your wstSHIT at 0.5% APR, no liquidation risk.</li>
            <li><strong>CDs.</strong> Convertible Deposits — now built into the app.</li>
            <li><strong>DAO.</strong> Vote on proposals, delegate, view contract parameters (previously Govern).</li>
            <li><strong>Engage</strong>${NEW_BADGE}. CD participants accumulate iSHIT, convertible to SHIT below market.</li>
          </ul>
        `,
        side: "right",
        align: "center",
      },
    },
    {
      name: "pulse",
      element: '[data-tour="nav-pulse"]',
      popover: {
        title: "Pulse – the protocol, live",
        description: `
          <p style="margin-bottom:20px">What the protocol is doing, what backs it, and every action it takes.</p>
          <ul>
            <li><strong>Overview.</strong> Live revenue, treasury health, buyback and emission activity</li>
            <li><strong>Treasury.</strong> What backs every SHIT — assets, liabilities, and protocol-owned liquidity</li>
            <li><strong>Protocol.</strong> Where revenue comes from and how it flows through buybacks and emissions</li>
            <li><strong>Feed.</strong> Every on-chain action as it happens</li>
          </ul>
        `,
        side: "right",
        align: "center",
        popoverClass: TIGHT_POPOVER_CLASS,
      },
    },
    {
      name: "cds",
      element: '[data-tour="nav-cds"]',
      popover: {
        title: "Convertible Deposits – now built in",
        description:
          "CDs are now fully integrated into the main app. Same positions, same mechanics — deposit, borrow, and track activity all from the sidebar.",
        side: "right",
        align: "center",
        popoverClass: TIGHT_POPOVER_CLASS,
      },
    },
    {
      name: "engage",
      element: '[data-tour="nav-engage"]',
      popover: {
        title: "Engage – Coming Soon",
        description:
          "Convertible Deposits participants receive convSHIT — the right to purchase SHIT at a discount to market. The more you participate, the more you accumulate.",
        side: "right",
        align: "center",
        popoverClass: TIGHT_POPOVER_CLASS,
      },
    },
  ];
}

// Must match border-width in .driver-popover-arrow (feature-tour.css).
const ARROW_HALF = 8;
const ARROW_HEIGHT = ARROW_HALF * 2;
// Keeps the arrow clear of the popover's rounded corners.
const ARROW_EDGE_PADDING = 16;

function alignArrow(popoverWrapper: HTMLElement, element: Element | undefined) {
  if (!element) return;
  const arrow = popoverWrapper.querySelector<HTMLElement>(".driver-popover-arrow");
  if (!arrow) return;

  const isSideArrow =
    arrow.classList.contains("driver-popover-arrow-side-left") ||
    arrow.classList.contains("driver-popover-arrow-side-right");
  if (!isSideArrow) return;

  const elRect = element.getBoundingClientRect();
  const popRect = popoverWrapper.getBoundingClientRect();
  const elCenterY = elRect.top + elRect.height / 2;

  const rawTop = elCenterY - popRect.top - ARROW_HALF;
  const maxTop = popRect.height - ARROW_EDGE_PADDING - ARROW_HEIGHT;
  const clampedTop = Math.max(ARROW_EDGE_PADDING, Math.min(rawTop, maxTop));

  arrow.style.top = `${clampedTop}px`;
  arrow.style.bottom = "auto";
  arrow.style.marginTop = "0";
}

function injectFooter(
  popover: { wrapper: HTMLElement },
  stepIndex: number,
  totalSteps: number,
  onSkip: () => void,
  onNext: () => void,
  isLast: boolean,
) {
  // Guard: prevent re-entrant calls (driver.js MutationObserver loop)
  if (popover.wrapper.querySelector(".shit-tour-footer")) return;

  const footer = document.createElement("div");
  footer.className = "shit-tour-footer";

  const dots = document.createElement("div");
  dots.className = "shit-tour-dots";
  dots.innerHTML = Array.from({ length: totalSteps })
    .map((_, i) => `<span class="shit-tour-dot${i === stepIndex ? " active" : ""}"></span>`)
    .join("");

  const buttons = document.createElement("div");
  buttons.className = "shit-tour-buttons";

  const skipBtn = document.createElement("button");
  skipBtn.className = "shit-tour-btn shit-tour-btn-skip";
  skipBtn.textContent = "Skip";
  skipBtn.addEventListener("click", onSkip);

  const nextBtn = document.createElement("button");
  nextBtn.className = "shit-tour-btn shit-tour-btn-next";
  nextBtn.textContent = isLast ? "Got It" : "Next";
  nextBtn.addEventListener("click", onNext);

  buttons.appendChild(skipBtn);
  buttons.appendChild(nextBtn);
  footer.appendChild(dots);
  footer.appendChild(buttons);
  popover.wrapper.appendChild(footer);
}

export function FeatureTour() {
  const { shouldShowModal, startTour, skipTour, completeTour, saveStep } = useFeatureTour();
  const { isMobile, isTablet } = useIsMobile();
  // Lazy init: check window width synchronously to avoid flicker on first render
  const [modalOpen, setModalOpen] = useState(
    () => shouldShowModal && window.innerWidth > DESKTOP_BREAKPOINT,
  );
  const driverRef = useRef<ReturnType<typeof driver> | null>(null);
  const tourStartTimeRef = useRef<number | null>(null);
  const trackedStepsRef = useRef<Set<number>>(new Set());
  const onboardingFiredRef = useRef(false);

  const completeTourRef = useRef(completeTour);
  const saveStepRef = useRef(saveStep);
  completeTourRef.current = completeTour;
  saveStepRef.current = saveStep;

  // Fire modal_shown / suppressed_mobile exactly once on first eligible mount.
  useEffect(() => {
    if (!shouldShowModal || onboardingFiredRef.current) return;
    onboardingFiredRef.current = true;
    if (window.innerWidth > DESKTOP_BREAKPOINT) {
      trackOnboardingModalShown(window.innerWidth);
    } else {
      trackOnboardingSuppressedMobile(window.innerWidth);
    }
  }, [shouldShowModal]);

  useEffect(() => {
    const steps = buildSteps();

    const driverInstance = driver({
      animate: true,
      overlayOpacity: 0.5,
      popoverClass: "shit-tour-popover",
      showButtons: [],
      allowClose: false,
      stagePadding: 0,
      stageRadius: 100,
      popoverOffset: 16,
      steps,
      onPopoverRender: (popover, opts) => {
        const index = opts.state.activeIndex ?? 0;
        const isLast = index === steps.length - 1;

        if (!trackedStepsRef.current.has(index)) {
          trackedStepsRef.current.add(index);
          trackOnboardingStepViewed(index, steps[index].name, steps.length);
        }

        injectFooter(
          popover,
          index,
          steps.length,
          () => {
            trackOnboardingTourSkipped(index, steps[index].name);
            saveStepRef.current(index);
            driverInstance.destroy();
          },
          () => {
            if (isLast) {
              const startedAt = tourStartTimeRef.current ?? Date.now();
              trackOnboardingTourCompleted(Date.now() - startedAt, steps.length);
              completeTourRef.current();
              driverInstance.destroy();
            } else {
              trackOnboardingStepAdvanced(index);
              driverInstance.moveNext();
            }
          },
          isLast,
        );

        // Defer to a microtask so driver.js has finished its own positioning
        // pass before we read the popover's geometry.
        queueMicrotask(() => alignArrow(popover.wrapper, opts.state.activeElement));
      },
    });

    let rafId: number | null = null;
    const handleReposition = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!driverInstance.isActive()) return;
        const el = driverInstance.getActiveElement();
        const wrapper = document.querySelector<HTMLElement>(".shit-tour-popover.driver-popover");
        if (el && wrapper) alignArrow(wrapper, el);
      });
    };
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    driverRef.current = driverInstance;

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
      driverInstance.destroy();
      driverRef.current = null;
    };
  }, []);

  const isDesktop = !isMobile && !isTablet;

  return (
    <FeatureTourWelcomeModal
      open={modalOpen && isDesktop}
      onSkip={(method) => {
        trackOnboardingModalSkipped(method);
        setModalOpen(false);
        skipTour();
      }}
      onStart={() => {
        if (!isDesktop) return;
        setModalOpen(false);
        trackOnboardingTourStarted();
        startTour();
        setTimeout(() => {
          tourStartTimeRef.current = Date.now();
          driverRef.current?.drive();
        }, 150);
      }}
    />
  );
}
