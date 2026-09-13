import * as React from "react";

import NumberFlowLib, { type Format, type NumberFlowElement } from "@number-flow/react";

export interface NumberProps extends React.HTMLAttributes<NumberFlowElement> {
  value?: number | string | null; // Allow value to be number, string, or null
  format?: Format;
  prefix?: string;
  suffix?: string;
  suffixNoSpace?: boolean;
  locales?: Intl.LocalesArgument;
  animated?: boolean;
}

const intlFormat: Format = {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
};

const NumberFlow = React.forwardRef<NumberFlowElement, NumberProps>(
  (
    {
      className,
      value,
      format = {},
      prefix,
      suffix,
      suffixNoSpace = false,
      locales = "en-US",
      ...props
    },
    ref,
  ) => {
    const parsedValue = value ? (Number.isNaN(+value) ? 0 : +value) : 0;

    return value !== "-" ? (
      <NumberFlowLib
        ref={ref}
        className={className}
        format={{ ...intlFormat, ...format }}
        value={parsedValue} // Pass sanitized number
        prefix={prefix}
        suffix={suffix && !suffixNoSpace ? ` ${suffix}` : suffix}
        locales={locales}
        {...props}
      />
    ) : (
      <p className={className}>-</p>
    );
  },
);

NumberFlow.displayName = "NumberFlow";

export { NumberFlow };
