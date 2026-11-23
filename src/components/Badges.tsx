import {Priority,Status} from '../lib/types';

interface StatusBadgeProps {
 status: Status | string;
}

const STATUS_CONFIG: Record<string, { label: string; dotColor: string }> = {
 reported: { label: 'Reported', dotColor: '#c8402f' },
 assigned: { label: 'Crew on the way', dotColor: '#2b6cff' },
 cleared: { label: 'Cleared', dotColor: '#2f7d57' },
 rejected: { label: 'Rejected as fake', dotColor: '#8892a0' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
 const conf = STATUS_CONFIG[status] || { label: status, dotColor: '#8892a0' };
 return (
  <span className="status-badge" title={`Status: ${conf.label}`}>
   <span className="status-badge-dot" style={{ backgroundColor: conf.dotColor }} aria-hidden="true" />
   <span>{conf.label}</span>
  </span>
 );
}

interface PriorityBadgeProps {
 priority: Priority | string;
 needsReview?: boolean;
}

const PRIORITY_CONFIG: Record<string, { label: string; bg: string; title: string }> = {
 high: { label: 'High', bg: '#c8402f', title: 'High priority' },
 medium: { label: 'Medium', bg: '#d97706', title: 'Medium priority' },
 low: { label: 'Low', bg: '#64748b', title: 'Low priority' },
};

export function PriorityBadge({ priority, needsReview }: PriorityBadgeProps) {
 if (needsReview) {
  return (
   <span className="priority-badge" style={{ backgroundColor: '#d97706' }} title="Awaiting admin review">
    Awaiting review
   </span>
  );
 }

 const conf = PRIORITY_CONFIG[priority] || { label: priority, bg: '#64748b', title: `${priority} priority` };
 return (
  <span className="priority-badge" style={{ backgroundColor: conf.bg }} title={conf.title}>
   {conf.label}
  </span>
 );
}

interface ReportBadgesProps {
 status: Status | string;
 priority?: Priority | string;
 needsReview?: boolean;
}

export function ReportBadges({ status, priority, needsReview }: ReportBadgesProps) {
 return (
  <div className="badge-group">
   <StatusBadge status={status} />
   {priority && <PriorityBadge priority={priority} needsReview={needsReview} />}
  </div>
 );
}
