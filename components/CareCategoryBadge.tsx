import { Bell, Bug, Droplets, FlaskConical, Flower2, HeartPulse, Layers3, Scissors, ShieldCheck, Sprout } from 'lucide-react'
import { careCategoryPresentation } from '@/lib/care-category-presentation'
import { cn } from '@/lib/utils'
const icons={droplets:Droplets,flask:FlaskConical,layers:Layers3,sprout:Sprout,bug:Bug,heart:HeartPulse,flower:Flower2,shield:ShieldCheck,scissors:Scissors,bell:Bell}
export function CareCategoryBadge({type,label,className}:{type:string;label?:string;className?:string}) {
  const presentation=careCategoryPresentation(type,label),Icon=icons[presentation.icon]
  return <span data-care-category={presentation.category} data-semantic-color={presentation.color} className={cn('semantic-chip inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5',className)}><Icon aria-hidden="true" className="h-4 w-4 shrink-0"/><span>{presentation.label}</span></span>
}
