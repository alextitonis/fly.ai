import type { Address } from "viem";
import * as dn from "dnum";
import {
  type Duration,
  type FormatDistanceToken,
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  differenceInMonths,
  formatDuration,
  intervalToDuration,
} from "date-fns";
import { format as formatDate } from "date-fns/format";
import { config } from "./wagmi-config";

export const handleInputNumberChange = (value: string) => {
  let cleanedValue = value.replace(/[^\d.]/g, "");

  // Ensure only one dot is allowed
  const countDots = (cleanedValue.match(/[.]/g) || []).length;
  if (countDots > 1) {
    cleanedValue = cleanedValue.slice(0, -1); // Remove the last character if it's an extra dot
  }

  return cleanedValue;
};

export function shortenAddress(address: Address, chars = 4) {
  return address.length < chars * 2 + 2
    ? address
    : `${address.slice(0, chars + 2)}\u2026${address.slice(-chars)}`;
}

/** Truncated tx-hash display, e.g. "0x1234...abcd". */
export function formatTxHash(hash?: `0x${string}`) {
  return hash ? `${hash.slice(0, 6)}...${hash.slice(-4)}` : "";
}

export const validateInsufficientBalance = (
  value = "0",
  tokenInfo: { decimals: number; balance?: bigint },
  errorMessage?: string,
) => {
  try {
    if (tokenInfo.balance) {
      return (
        dn.lessThanOrEqual(value, [tokenInfo.balance, tokenInfo.decimals]) ||
        (errorMessage ?? "The amount exceeds wallet balance.")
      );
    } else {
      return true;
    }
  } catch {
    return true;
  }
};

export function formatDistance(start: Date, end: Date, suffix = "ago") {
  const duration = intervalToDuration({ start, end });

  const formatDistanceLocale: Partial<Record<FormatDistanceToken, string>> = {
    xSeconds: "{{count}} second",
    xMinutes: "{{count}} minute",
    xHours: "{{count}} hour",
    xDays: "{{count}} day",
  };

  let format: (keyof Duration)[] = [];

  switch (0) {
    case differenceInMinutes(end, start):
      format = ["seconds"];
      break;
    case differenceInHours(end, start):
      format = ["minutes"];
      break;
    case differenceInDays(end, start):
      format = ["hours"];
      break;
    case differenceInMonths(end, start):
      format = ["days"];
      duration.days = differenceInDays(end, start);
      break;
  }

  const formattedDuration = formatDuration(duration, {
    format,
    locale: {
      formatDistance: (token, count) => {
        if (!formatDistanceLocale[token]) {
          return "";
        }
        return (
          formatDistanceLocale[token].replace("{{count}}", count.toString()) +
          `${count > 1 ? "s" : ""} ${suffix}`
        );
      },
    },
  });

  return formattedDuration || formatDate(start, "MMM dd, yyyy hh:mm aa");
}

export const blockExplorerTxBaseUrl = `${config.getClient().chain.blockExplorers?.default.url}/tx/`;

const BLOCK_EXPLORER_URLS: Record<number, string> = {
  1: "https://etherscan.io",
  42161: "https://arbiscan.io",
  8453: "https://basescan.org",
  80094: "https://berascan.com",
};

export function getBlockExplorerTxUrl(chainId: number, txHash: string): string {
  const baseUrl = BLOCK_EXPLORER_URLS[chainId];
  if (!baseUrl) return "#";
  return `${baseUrl}/tx/${txHash}`;
}
