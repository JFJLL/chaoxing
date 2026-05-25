import { expect, type Page } from "@playwright/test";

export async function loginAs(page: Page, name = "李素艳") {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(/\/space/);
}

export async function firstTaughtCourseId(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/courses?tab=taught");
    const body = await response.json();
    return body.courses[0].id as string;
  });
}
