/** 조건부 className 을 합친다. false·null·undefined 는 버린다. */
export function cx(
  ...values: (string | false | null | undefined)[]
): string | undefined {
  const joined = values.filter(Boolean).join(' ');
  return joined === '' ? undefined : joined;
}
