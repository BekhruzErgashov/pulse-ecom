import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Заливка цветной плашки в тёмной теме. Смешивается с --color-paper, а не
 * с чёрным — иначе тёплые цвета буреют и уходят из палитры приложения.
 */
export function chipTint(token: string): string {
  return `color-mix(in oklab, ${token} 82%, var(--color-paper) 18%)`;
}
