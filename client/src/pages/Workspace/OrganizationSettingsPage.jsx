import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import { useTheme } from '../../context/ThemeContext';
import { appShellBg } from '../../theme/shellTheme';
import OrganizationSettingsPanel from '../../components/Organization/OrganizationSettingsPanel';
import { organizationAPI } from '../../services/api/organizationAPI';
import { useAppStrings } from '../../locales/appStrings';

const unwrap = (payload) => payload?.data ?? payload;

/**
 * Cài đặt workspace full màn hình: sidebar app + 2 cột (mục | nội dung) trong OrganizationSettingsPanel.
 * Đường dẫn: /workspaces/:orgId/settings?tab=join
 */
export default function OrganizationSettingsPage() {
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();
  const shell = isDarkMode ? 'flex min-h-screen bg-[#0b0e14]' : `flex min-h-screen ${appShellBg(false)}`;
  const { orgId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialTab = searchParams.get('tab') || undefined;

  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const organizationHomePath = organization?.slug
    ? `/w/${encodeURIComponent(organization.slug)}`
    : '/dashboard';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!orgId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const payload = await organizationAPI.getOrganization(orgId);
        const data = unwrap(payload);
        const o = data?.data ?? data;
        if (!cancelled) setOrganization(o || null);
      } catch {
        if (!cancelled) setOrganization(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const handleOrganizationUpdated = () => {
    if (!orgId) return;
    organizationAPI
      .getOrganization(orgId)
      .then((payload) => {
        const data = unwrap(payload);
        const o = data?.data ?? data;
        if (o) setOrganization(o);
      })
      .catch(() => {});
  };

  if (!orgId) {
    return (
      <div className={shell}>
        <NavigationSidebar />
        <main className={`flex flex-1 items-center justify-center ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>
          {t('organizationSettings.missingOrgId')}
        </main>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={shell}>
        <NavigationSidebar />
        <main className={`flex flex-1 items-center justify-center ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>
          {t('organizationSettings.loading')}
        </main>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className={shell}>
        <NavigationSidebar />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <p className={isDarkMode ? 'text-gray-400' : 'text-slate-600'}>{t('organizationSettings.notFound')}</p>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="text-cyan-400 hover:underline"
          >
            {t('organizationSettings.backOrgs')}
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className={shell}>
      <NavigationSidebar />
      <OrganizationSettingsPanel
        organization={organization}
        initialTab={initialTab}
        onBack={() => navigate(organizationHomePath)}
        onOrganizationUpdated={handleOrganizationUpdated}
        onOrganizationDeleted={() => navigate('/dashboard')}
      />
    </div>
  );
}
