'use client'
export default function ApplicationError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section role="alert" className="mx-auto max-w-xl space-y-4 rounded-lg border border-stone-300 bg-[color:var(--ax-surface-solid)] p-6">
    <h1 className="font-serif text-2xl font-semibold">This view could not finish loading</h1>
    <p>The connection may have been interrupted. Some changes may already have been saved. Load the view again and check the result before repeating an action.</p>
    <button type="button" onClick={reset} className="rounded bg-[#2f6b45] px-4 py-2 text-white">Try loading this view again</button>
  </section>
}
