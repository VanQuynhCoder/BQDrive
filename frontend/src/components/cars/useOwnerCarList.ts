//Hook quản lý trạng thái danh sách xe ký gửi.
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import {
  countOwnerCars,
  filterAndSortOwnerCars,
  parseOwnerCarSort,
  parseOwnerCarStatusFilter,
  type OwnerCarListItem,
  type OwnerCarSort,
  type OwnerCarStatusFilter,
} from "../../utils/ownerCarList.util";

export function useOwnerCarList<T extends OwnerCarListItem>(cars: T[]) {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("search") || "";
  const status = parseOwnerCarStatusFilter(searchParams.get("status"));
  const sort = parseOwnerCarSort(searchParams.get("sort"));
  const queryCarId = searchParams.get("carId");

  const updateQuery = useCallback(
    (
      key: "search" | "status" | "sort",
      value: string,
      options?: { replace?: boolean },
    ) => {
      const next = new URLSearchParams(searchParams);
      const isDefault =
        (key === "status" && value === "ALL") ||
        (key === "sort" && value === "UPDATED_DESC");

      if (!value.trim() || isDefault) {
        next.delete(key);
      } else {
        next.set(key, value);
      }

      setSearchParams(next, { replace: options?.replace });
    },
    [searchParams, setSearchParams],
  );

  const counts = useMemo(() => countOwnerCars(cars), [cars]);
  const visibleCars = useMemo(
    () => filterAndSortOwnerCars(cars, search, status, sort),
    [cars, search, sort, status],
  );

  const clearQueryCarId = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("carId");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  return {
    search,
    status,
    sort,
    counts,
    visibleCars,
    queryCarId,
    clearQueryCarId,
    setSearch: (value: string) =>
      updateQuery("search", value, { replace: true }),
    setStatus: (value: OwnerCarStatusFilter) =>
      updateQuery("status", value),
    setSort: (value: OwnerCarSort) => updateQuery("sort", value),
  };
}
