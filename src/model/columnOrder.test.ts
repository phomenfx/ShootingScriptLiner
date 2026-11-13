import { describe, expect, it } from "vitest";
import { moveColumn, orderColumns } from "./shotTable";

const cols = ["shot", "a", "b", "c", "d"].map((id) => ({ id }));
const ids = (list: { id: string }[]) => list.map((c) => c.id);

describe("column order", () => {
  it("keeps the built-in order when nothing is saved", () => {
    expect(ids(orderColumns(cols, []))).toEqual(["shot", "a", "b", "c", "d"]);
  });

  it("follows the saved order with Shot always first", () => {
    expect(ids(orderColumns(cols, ["d", "shot", "b", "a", "c"]))).toEqual(["shot", "d", "b", "a", "c"]);
  });

  it("slots in columns the saved order doesn't name after their neighbor", () => {
    expect(ids(orderColumns(cols, ["c", "a", "gone"]))).toEqual(["shot", "c", "d", "a", "b"]);
  });

  it("moves a column before or after another", () => {
    expect(moveColumn(["a", "b", "c", "d"], "d", "b", false)).toEqual(["a", "d", "b", "c"]);
    expect(moveColumn(["a", "b", "c", "d"], "a", "c", true)).toEqual(["b", "c", "a", "d"]);
    expect(moveColumn(["a", "b"], "a", "a", true)).toEqual(["a", "b"]);
  });
});
