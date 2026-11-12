import { CreditCard, RotateCcw, ArrowLeftRight, Truck, Headphones } from 'lucide-react';

export default function SupportIcon({ type, ...props }) {
  const Icon = { return: RotateCcw, truck: Truck, exchange: ArrowLeftRight, card: CreditCard }[type] || Headphones;
  return <Icon size={20} strokeWidth={1.6} aria-hidden="true" {...props} />;
}
