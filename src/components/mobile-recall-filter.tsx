"use client";

import Form from "next/form";
import { noticeCategories } from "@/lib/notice-category";
import { SubmitButton } from "./submit-button";

export function MobileRecallFilter({ category, source, period, q }: { category: string; source: string; period: string; q: string }) {
  return <Form action="/notices" className="mobile-recall-filter">
    <input type="hidden" name="source" value={source} />
    <input type="hidden" name="period" value={period} />
    <input type="hidden" name="q" value={q} />
    <label><span className="visually-hidden">Recall category</span><select name="category" defaultValue={category} onChange={event => event.currentTarget.form?.requestSubmit()}><option value="all">All categories</option>{noticeCategories.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
    <SubmitButton className="button button-secondary" pendingLabel="Updating…">View</SubmitButton>
  </Form>;
}
