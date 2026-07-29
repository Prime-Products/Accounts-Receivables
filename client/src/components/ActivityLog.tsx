import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, CheckSquare, FileText, Mail, Phone, AlertCircle } from "lucide-react";
import type { ActivityLog as ActivityLogType } from "../../../drizzle/schema";

interface ActivityLogProps {
  activities: ActivityLogType[];
}

const activityTypeConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  note: {
    icon: <MessageSquare className="w-4 h-4" />,
    color: "bg-blue-50 text-blue-700 border-blue-200",
    label: "Note",
  },
  task: {
    icon: <CheckSquare className="w-4 h-4" />,
    color: "bg-purple-50 text-purple-700 border-purple-200",
    label: "Task",
  },
  promise: {
    icon: <FileText className="w-4 h-4" />,
    color: "bg-green-50 text-green-700 border-green-200",
    label: "Promise",
  },
  email: {
    icon: <Mail className="w-4 h-4" />,
    color: "bg-orange-50 text-orange-700 border-orange-200",
    label: "Email",
  },
  call: {
    icon: <Phone className="w-4 h-4" />,
    color: "bg-indigo-50 text-indigo-700 border-indigo-200",
    label: "Call",
  },
  status_change: {
    icon: <AlertCircle className="w-4 h-4" />,
    color: "bg-red-50 text-red-700 border-red-200",
    label: "Status",
  },
};

function fmtDate(ts: number | Date): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

function fmtTime(ts: number | Date): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export function ActivityLog({ activities }: ActivityLogProps) {
  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity Log</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No activities recorded yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity Log</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {activities.map((activity) => {
            const config = activityTypeConfig[activity.activityType] || activityTypeConfig.note;
            const createdAt = activity.createdAt instanceof Date ? activity.createdAt : new Date(activity.createdAt);

            return (
              <div key={activity.id} className="flex gap-3 pb-3 border-b last:border-b-0">
                {/* Icon */}
                <div className="flex-shrink-0 pt-1">
                  <div className={`p-2 rounded-lg ${config.color}`}>{config.icon}</div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">{activity.title}</p>
                      {activity.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{activity.description}</p>
                      )}
                    </div>
                    <Badge variant="outline" className={`text-[10px] whitespace-nowrap flex-shrink-0 ${config.color}`}>
                      {config.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <span>{fmtDate(createdAt)}</span>
                    <span>•</span>
                    <span>{fmtTime(createdAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
