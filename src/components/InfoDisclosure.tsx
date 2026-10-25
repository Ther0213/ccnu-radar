import type { ReactNode } from 'react'

export function InfoDisclosure({ title = '了解更多', children }: { title?: string; children: ReactNode }) {
  return <details className="info-disclosure"><summary>{title}</summary><div>{children}</div></details>
}
