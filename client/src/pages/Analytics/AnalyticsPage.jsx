import { useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import ThreeFrameLayout from '../../components/Layout/ThreeFrameLayout';
import { GlassCard } from '../../components/Shared';
import { useTheme } from '../../context/ThemeContext';
import { useAppStrings } from '../../locales/appStrings';

function AnalyticsPage() {
  const { isDarkMode } = useTheme();
  const navigate = useNavigate();
  const { t } = useAppStrings();
  const [timeRange, setTimeRange] = useState('week');

  const rangeLabel =
    timeRange === 'day'
      ? t('analytics.rangeDay')
      : timeRange === 'week'
        ? t('analytics.rangeWeek')
        : timeRange === 'month'
          ? t('analytics.rangeMonth')
          : t('analytics.rangeYear');

  const onDemoChartInteract = (chartTitle, dayLabel) => {
    toast(t('analytics.toastDemo', { chart: chartTitle, day: dayLabel, range: rangeLabel }), {
      icon: 'ℹ️',
    });
    navigate('/tasks');
  };

  return (
    <>
      <ThreeFrameLayout
        center={
          <div className="p-6">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-black text-gradient mb-2 md:text-5xl">{t('analytics.title')}</h1>
            <p className={`text-base leading-relaxed ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>
              {t('analytics.subtitle')}
            </p>
          </div>
          <div className="flex gap-3">
            <div className="flex gap-2">
              {[
                { id: 'day', label: t('analytics.tabDay') },
                { id: 'week', label: t('analytics.tabWeek') },
                { id: 'month', label: t('analytics.tabMonth') },
                { id: 'year', label: t('analytics.tabYear') },
              ].map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setTimeRange(r.id)}
                  className={`px-4 py-2 rounded-xl font-semibold transition-all ${
                    timeRange === r.id
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                      : 'glass hover:bg-white/10 text-gray-400'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                const data = {
                  timeRange: rangeLabel,
                  exportedAt: new Date().toLocaleString('vi-VN'),
                  stats: { users: 1245, messages: '45.2K', growth: '+24.5%' },
                };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `analytics-report-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success(t('analytics.exportOk'));
              }}
              className="glass px-4 py-2 rounded-xl hover:bg-white/10 transition-all font-semibold flex items-center gap-2"
            >
              {t('analytics.exportBtn')}
            </button>
          </div>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          {[
            {
              id: 'growth',
              icon: '📈',
              label: t('analytics.statGrowth'),
              value: '+24.5%',
              trend: 'up',
              color: 'from-green-500 to-emerald-500',
              detail: t('analytics.statGrowthDetail'),
            },
            {
              id: 'users',
              icon: '👥',
              label: t('analytics.statActiveUsers'),
              value: '1,245',
              trend: 'up',
              color: 'from-blue-500 to-cyan-500',
              detail: t('analytics.statActiveDetail'),
            },
            {
              id: 'messages',
              icon: '💬',
              label: t('analytics.statMessages'),
              value: '45.2K',
              trend: 'up',
              color: 'from-purple-600 to-pink-600',
              detail: t('analytics.statMsgDetail'),
            },
            {
              id: 'completion',
              icon: '✅',
              label: t('analytics.statCompletion'),
              value: '89%',
              trend: 'up',
              color: 'from-orange-500 to-yellow-500',
              detail: t('analytics.statCompletionDetail'),
            },
          ].map((stat, idx) => (
            <GlassCard
              key={stat.id}
              hover
              glow
              className="animate-slideUp cursor-pointer"
              style={{ animationDelay: `${idx * 0.1}s` }}
              onClick={() => {
                if (stat.id === 'growth' || stat.id === 'completion') navigate('/tasks');
                else if (stat.id === 'users') navigate('/friends');
                else if (stat.id === 'messages') navigate('/chat/friends');
                else navigate('/dashboard');
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center text-3xl shadow-lg`}>
                  {stat.icon}
                </div>
                <div className={`px-2 py-1 rounded-lg ${stat.trend === 'up' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'} text-xs font-bold`}>
                  {stat.trend === 'up' ? '↗' : '↘'} {stat.value}
                </div>
              </div>
              <div className="text-sm text-gray-400 mb-1">{stat.label}</div>
              <div className="text-xs text-gray-600">{stat.detail}</div>
            </GlassCard>
          ))}
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Task Completion Chart */}
          <GlassCard>
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <span>✅</span> {t('analytics.chartTasksTitle')}
            </h3>
            <div className="grid grid-cols-7 gap-2 h-48">
              {[85, 92, 78, 95, 88, 91, 89].map((value, idx) => {
                const dayLabel = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][idx];
                return (
                  <button
                    key={idx}
                    type="button"
                    className="flex flex-col items-center justify-end rounded-lg outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-purple-500/50"
                    onClick={() => onDemoChartInteract(t('analytics.chartTasksTitle'), dayLabel)}
                  >
                    <div className="text-xs font-bold text-white mb-2">{value}%</div>
                    <div
                      className="w-full bg-gradient-to-t from-green-500 to-emerald-500 rounded-t-lg transition-all hover:scale-105"
                      style={{ height: `${value}%` }}
                    />
                    <div className="text-xs text-gray-500 mt-2">{dayLabel}</div>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-sm">
              <span className="text-gray-400">{t('analytics.weekAvg')}</span>
              <span className="text-green-400 font-bold">{t('analytics.vsPrevGreen')}</span>
            </div>
          </GlassCard>

          {/* Active Users Chart */}
          <GlassCard>
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <span>👥</span> {t('analytics.chartUsersTitle')}
            </h3>
            <div className="grid grid-cols-7 gap-2 h-48">
              {[1120, 1245, 1089, 1356, 1278, 1401, 1245].map((value, idx) => {
                const maxValue = 1500;
                const percentage = (value / maxValue) * 100;
                const dayLabel = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][idx];
                return (
                  <button
                    key={idx}
                    type="button"
                    className="flex flex-col items-center justify-end rounded-lg outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-cyan-500/50"
                    onClick={() => onDemoChartInteract(t('analytics.chartUsersTitle'), dayLabel)}
                  >
                    <div className="text-xs font-bold text-white mb-2">{value}</div>
                    <div
                      className="w-full bg-gradient-to-t from-blue-500 to-cyan-500 rounded-t-lg transition-all hover:scale-105"
                      style={{ height: `${percentage}%` }}
                    />
                    <div className="text-xs text-gray-500 mt-2">{dayLabel}</div>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-sm">
              <span className="text-gray-400">{t('analytics.weekAvgUsers')}</span>
              <span className="text-blue-400 font-bold">{t('analytics.vsPrevBlue')}</span>
            </div>
          </GlassCard>
        </div>

        {/* Department Performance */}
        <GlassCard className="mb-8">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <span>🏢</span> {t('analytics.deptPerfTitle')}
          </h3>
          <div className="space-y-4">
            {[
              { name: t('analytics.deptEngineering'), tasks: 45, completed: 38, members: 18, progress: 84, color: 'from-purple-600 to-pink-600' },
              { name: t('analytics.deptDesign'), tasks: 32, completed: 30, members: 12, progress: 94, color: 'from-blue-500 to-cyan-500' },
              { name: t('analytics.deptMarketing'), tasks: 28, completed: 24, members: 8, progress: 86, color: 'from-green-500 to-emerald-500' },
              { name: t('analytics.deptProduct'), tasks: 35, completed: 29, members: 7, progress: 83, color: 'from-orange-500 to-yellow-500' },
            ].map((dept, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  toast(t('analytics.deptToast', { name: dept.name }), { icon: 'ℹ️' });
                  navigate('/tasks');
                }}
                className="glass-strong w-full rounded-xl p-4 text-left transition hover:bg-white/5"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${dept.color} flex items-center justify-center text-xl`}>
                      {['⚙️', '🎨', '📢', '📱'][idx]}
                    </div>
                    <div>
                      <div className="font-bold text-white">{dept.name}</div>
                      <div className="text-xs text-gray-500">{t('analytics.deptMembers', { n: dept.members })}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <div className="text-white font-bold">{dept.completed}/{dept.tasks}</div>
                      <div className="text-gray-500 text-xs">{t('analytics.deptTasksLabel')}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-green-400 font-bold">{dept.progress}%</div>
                      <div className="text-gray-500 text-xs">{t('analytics.deptDoneLabel')}</div>
                    </div>
                  </div>
                </div>
                <div className="w-full h-2 glass-strong rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${dept.color} transition-all`}
                    style={{ width: `${dept.progress}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
        </GlassCard>

        {/* Top Contributors */}
        <div className="grid grid-cols-2 gap-6">
          <GlassCard>
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <span>🏆</span> {t('analytics.topContributors')}
            </h3>
            <div className="space-y-3">
              {[
                { name: 'Sarah Chen', avatar: '👩‍💼', tasks: 45, points: 1250, trend: '+15%' },
                { name: 'Mike Ross', avatar: '👨‍💻', tasks: 42, points: 1180, trend: '+12%' },
                { name: 'Emma Wilson', avatar: '👩‍🎨', tasks: 38, points: 1050, trend: '+8%' },
                { name: 'David Kim', avatar: '👨‍🔬', tasks: 35, points: 980, trend: '+10%' }
              ].map((user, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => navigate('/tasks')}
                  className="flex w-full items-center gap-4 rounded-xl p-3 text-left glass-strong transition hover:bg-white/5"
                >
                  <div className="text-2xl font-black text-gradient">#{idx + 1}</div>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-xl">
                    {user.avatar}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-white">{user.name}</div>
                    <div className="text-xs text-gray-400">
                      {t('analytics.tasksPoints', { tasks: user.tasks, points: user.points })}
                    </div>
                  </div>
                  <div className="text-green-400 text-sm font-bold">{user.trend}</div>
                </button>
              ))}
            </div>
          </GlassCard>

          <GlassCard>
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <span>📊</span> {t('analytics.recentActivity')}
            </h3>
            <div className="space-y-3">
              {[
                {
                  action: t('analytics.actTaskDone'),
                  detail: t('analytics.actTaskDoneDetail'),
                  icon: '✅',
                  color: 'from-green-500 to-emerald-500',
                  path: '/tasks',
                },
                {
                  action: t('analytics.actMeetings'),
                  detail: t('analytics.actMeetingsDetail'),
                  icon: '🎤',
                  color: 'from-blue-500 to-cyan-500',
                  path: '/calendar',
                },
                {
                  action: t('analytics.actFiles'),
                  detail: t('analytics.actFilesDetail'),
                  icon: '📁',
                  color: 'from-purple-600 to-pink-600',
                  path: '/documents',
                },
                {
                  action: t('analytics.actMembers'),
                  detail: t('analytics.actMembersDetail'),
                  icon: '👥',
                  color: 'from-orange-500 to-yellow-500',
                  path: '/friends',
                },
              ].map((activity, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => navigate(activity.path)}
                  className="flex w-full items-center gap-4 rounded-xl p-3 text-left glass-strong transition hover:bg-white/5"
                >
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${activity.color} flex items-center justify-center text-xl`}>
                    {activity.icon}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-white">{activity.action}</div>
                    <div className="text-xs text-gray-400">{activity.detail}</div>
                  </div>
                </button>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
        }
      />
    </>
  );
}

// ============= SETTINGS PAGE =============

export default AnalyticsPage;
