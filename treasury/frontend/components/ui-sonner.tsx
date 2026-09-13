import { toast as sonnerToast, Toaster } from "sonner";
import {
  RiCloseLargeFill,
  RiInformationFill,
  RiSpam2Fill,
  RiAlertFill,
  RiCheckboxFill,
} from "@remixicon/react";
import type { ReactNode } from "react";

/** I recommend abstracting the toast function
 *  so that you can call it without having to use toast.custom everytime. */
export function toast(toast: Omit<ToastProps, "id">, options?: { duration?: number }) {
  return sonnerToast.custom(
    (id) => <Toast id={id} type={toast.type} title={toast.title} description={toast.description} />,
    options,
  );
}

type TOAST_TYPE = "success" | "info" | "warning" | "error";

const ICONS_TYPES: Record<TOAST_TYPE, ReactNode> = {
  success: <RiCheckboxFill size={20} className="size-4 text-green" />,
  info: <RiInformationFill size={20} className="size-4 text-orange" />,
  warning: <RiSpam2Fill size={20} className="size-4 text-orange" />,
  error: <RiAlertFill size={20} className="size-4 text-red" />,
};

/** A fully custom toast that still maintains the animations and interactions. */
function Toast(props: ToastProps) {
  const { title, description, id, type } = props;

  return (
    <div className="flex gap-x-3 items-start clip-corners-1 shadow-toaster bg-surface-toast w-full md:max-w-[364px] p-3 rounded-2xl">
      <div className="size-4">{ICONS_TYPES[type]}</div>
      <div className="w-full flex flex-col gap-y-1">
        <p className="text-sm font-medium text-primary-t">{title}</p>
        {description && <p className="text-sm text-secondary-t">{description}</p>}
      </div>
      <button
        type="button"
        className="text-tertiary-t"
        onClick={() => {
          sonnerToast.dismiss(id);
        }}
      >
        <RiCloseLargeFill size={20} className="size-4" />
      </button>
    </div>
  );
}

export const ToasterProvider = () => {
  return <Toaster className="toaster group pointer-events-auto" />;
};

interface ToastProps {
  id: string | number;
  title: string;
  description?: string;
  type: TOAST_TYPE;
  // button?: {
  //   label: string;
  //   onClick: () => void;
  // };
}
