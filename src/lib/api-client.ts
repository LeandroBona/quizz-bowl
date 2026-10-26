export async function responseJson(response: Response) {
  if (response.ok) return response.status === 204 ? null : response.json();
  const body = await response.json().catch(() => ({}));
  throw new Error(body.issues?.[0]?.message || body.error || "Não foi possível concluir a operação.");
}
