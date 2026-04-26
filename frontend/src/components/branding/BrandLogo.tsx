import { cn } from '../../lib/utils';

type BrandLogoProps = {
  iconClassName?: string;
  textClassName?: string;
  showAdminTag?: boolean;
};

export function BrandLogo({ iconClassName, textClassName, showAdminTag = false }: BrandLogoProps) {
  return (
    <div className="flex items-center gap-2">
      <img
        src="/favicon.svg"
        alt="Farely logo"
        className={cn('h-8 w-8 rounded object-contain', iconClassName)}
      />
      <span className={cn('font-bold tracking-tight text-emerald-900', textClassName)}>
        Farely
        {showAdminTag ? <span className="text-emerald-600"> Admin</span> : null}
      </span>
    </div>
  );
}
