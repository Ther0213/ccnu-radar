import { useState } from 'react'

export function QQGroup({ value }: { value?: string }) {
  const [message, setMessage] = useState('')
  const group = value?.trim() ?? ''
  return <section className="qq-group"><h3>活动 QQ 群</h3>
    {group ? <>
      <div className="qq-group-actions"><code>{group}</code><button type="button" onClick={async () => {
        try {
          if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
          await navigator.clipboard.writeText(group)
          setMessage('群号已复制，请在 QQ 中搜索加入。')
        } catch { setMessage('自动复制不可用，请选中上方群号手动复制。') }
      }}>复制群号</button></div>
      <p>请在 QQ 中搜索群号，能否加入以群设置为准。入群不等于本站报名。</p>
      <p role="status">{message}</p>
    </> : <p>发布者暂未提供群号。</p>}
  </section>
}
