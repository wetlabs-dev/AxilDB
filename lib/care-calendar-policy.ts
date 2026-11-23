import { quietDayRuleDefaults } from '@/lib/care-scheduling'
export const calendarPolicyVersion = 2
export const calendarPolicy = { shortWateringDays: 7, longWateringDays: 14, maximumShiftDays: 14, coherentGroupLimit: 40 }
/** The same limits govern automatic planning and manual-exception labels. */
export function calendarShiftPolicy(item: {taskType:string;cadenceDays?:number}, rules: Array<{careType:string;active:boolean;defaultShiftDirection:string;maxShiftDaysBefore:number;maxShiftDaysAfter:number}>) {
  const type=item.taskType==='REPOT'?'REPOTTING':item.taskType
  const defaults=quietDayRuleDefaults[type as keyof typeof quietDayRuleDefaults]||{direction:'SMART',before:1,after:1}
  const rule=rules.find(rule=>rule.careType===type&&rule.active)
  const bound=item.taskType==='WATER'?Math.min(calendarPolicy.maximumShiftDays,Math.min(item.cadenceDays||3,Math.max(2,Math.floor((item.cadenceDays||3)/3)))):calendarPolicy.maximumShiftDays
  const before=Math.min(bound,rule?.maxShiftDaysBefore??(item.taskType==='WATER'?bound:defaults.before)),after=Math.min(bound,rule?.maxShiftDaysAfter??(item.taskType==='WATER'?bound:defaults.after))
  const direction=rule?.defaultShiftDirection||'SMART'
  let preferred:string|null=direction==='SMART'?null:direction
  if(!preferred&&item.taskType==='WATER') {
    if((item.cadenceDays||0)<=calendarPolicy.shortWateringDays)preferred='EARLIER'
    else if((item.cadenceDays||0)>=calendarPolicy.longWateringDays)preferred='LATER'
  }
  return {type,before,after,preferred}
}
