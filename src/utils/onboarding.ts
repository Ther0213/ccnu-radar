export function onboardingFailureMessage(status: number): string {
  if (status === 404) return '后端版本尚未更新，暂不支持保存教程状态。请重启后端后重试，也可以先关闭教程继续使用。'
  if (status === 401) return '登录状态已失效，教程状态尚未保存。请先关闭教程，重新登录后再试。'
  return '暂时无法保存教程状态，请稍后重试，也可以先关闭教程继续使用。'
}

export function shouldShowOnboarding(user: { id: string; onboardingCompleted?: boolean } | null, manualUserId: string | null, deferredUserId: string | null): boolean {
  return Boolean(user && (manualUserId === user.id || user.onboardingCompleted === false && deferredUserId !== user.id))
}
