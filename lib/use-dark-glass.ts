"use client";

import * as React from "react";
import { useTheme } from "next-themes";

/**
 * На сервере темы ещё нет, поэтому без guard'а `mounted` серверная и
 * клиентская разметка расходятся и React ругается на гидрацию. До
 * монтирования считаем тему светлой — как её отрендерил сервер.
 */
export function useDarkGlass(): boolean {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return mounted && resolvedTheme === "dark-glass";
}
