"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="page"><div className="empty-state"><h2>SafeKeep couldn’t load this view.</h2><p>Your local data has not been changed.</p><button className="button button-primary" onClick={reset}>Try again</button></div></div>; }
