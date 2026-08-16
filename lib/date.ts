export const dateValue = (date: string) => {
  const [year, month = 1, day = 1] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};

export const compareDateDesc = (left: string, right: string) =>
  dateValue(right) - dateValue(left) || right.localeCompare(left);

export const sortByDateDesc = <T extends { date: string }>(items: T[]) =>
  [...items].sort((left, right) => compareDateDesc(left.date, right.date));
