import { Button, type ButtonVariant } from '../Button';

export interface RetryButtonProps {
  onRetry: () => void;
  label?: string;
  variant?: ButtonVariant;
}

export function RetryButton({
  onRetry,
  label = '다시 시도',
  variant = 'outline',
}: RetryButtonProps) {
  return (
    <Button variant={variant} onClick={onRetry}>
      {label}
    </Button>
  );
}
