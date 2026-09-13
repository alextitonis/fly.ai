import * as React from "react";

const MOBILE_BREAKPOINT = 639.5;
const TABLET_BREAKPOINT = 1023.5;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);
  const [isTablet, setIsTablet] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mqlMobile = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const mqlTablet = window.matchMedia(`(max-width: ${TABLET_BREAKPOINT - 1}px)`);
    const onChangeMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    const onChangeTablet = () => {
      setIsTablet(window.innerWidth < TABLET_BREAKPOINT && window.innerWidth > MOBILE_BREAKPOINT);
    };
    mqlMobile.addEventListener("change", onChangeMobile);
    mqlTablet.addEventListener("change", onChangeTablet);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    setIsTablet(window.innerWidth < TABLET_BREAKPOINT && window.innerWidth > MOBILE_BREAKPOINT);
    return () => {
      mqlMobile.removeEventListener("change", onChangeMobile);
      mqlTablet.removeEventListener("change", onChangeTablet);
    };
  }, []);

  return { isMobile: !!isMobile, isTablet: !!isTablet };
}
