import { useEffect } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { useSocket } from '../../context/SocketContext';

import { queryKeys } from '../../lib/queryKeys';

import { NOTIFICATIONS_REFRESH_EVENT } from '../../services/notificationSync';



/**

 * Invalidate / hydrate React Query cache khi có snapshot realtime (wave-3c).

 */

export default function QueryRealtimeSync() {

  const queryClient = useQueryClient();

  const { on, off, connected } = useSocket();



  useEffect(() => {

    const onWindowRefresh = () => {

      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });

    };



    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, onWindowRefresh);



    return () => {

      window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, onWindowRefresh);

    };

  }, [queryClient]);



  useEffect(() => {

    if (!connected) return undefined;



    const invalidateFriends = () => {

      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });

    };



    const onUnreadUpdated = (payload = {}) => {

      const scope = payload.scope === 'organization' ? 'organization' : 'personal';

      const organizationId =

        scope === 'organization' ? String(payload.organizationId || '') : '';

      const count = Number(payload.count);

      if (!Number.isFinite(count)) {

        queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });

        return;

      }

      queryClient.setQueryData(queryKeys.notifications.badge(scope, organizationId), {

        unreadCount: Math.max(0, count),

      });

      const orgId = organizationId;

      if (scope === 'organization' && orgId) {

        queryClient.setQueryData(queryKeys.org.shell(orgId), (prev) => {

          if (!prev || typeof prev !== 'object') return prev;

          return {

            ...prev,

            badges: {

              ...(prev.badges || {}),

              notificationsUnreadOrg: Math.max(0, count),

            },

          };

        });

      }

    };



    const onOrgShellUpdated = (payload = {}) => {

      const orgId = String(payload.organizationId || '').trim();

      if (!orgId) return;

      queryClient.invalidateQueries({ queryKey: queryKeys.org.shell(orgId) });

    };



    const onLegacyNotification = () => {

      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });

    };



    const notificationEvents = [

      'notification:new',

      'notification:bulk_new',

      'notification:read',

      'notification:read_many',

      'notification:read_all',

      'notification:deleted',

      'notification:deleted_read_all',

    ];



    notificationEvents.forEach((ev) => on(ev, onLegacyNotification));

    on('notification:unread_updated', onUnreadUpdated);

    on('org:shell:updated', onOrgShellUpdated);



    on('friend:request_received', invalidateFriends);

    on('friend:request_sent', invalidateFriends);

    on('friend:request_accepted', invalidateFriends);

    on('friend:request_rejected', invalidateFriends);



    return () => {

      notificationEvents.forEach((ev) => off(ev, onLegacyNotification));

      off('notification:unread_updated', onUnreadUpdated);

      off('org:shell:updated', onOrgShellUpdated);

      off('friend:request_received', invalidateFriends);

      off('friend:request_sent', invalidateFriends);

      off('friend:request_accepted', invalidateFriends);

      off('friend:request_rejected', invalidateFriends);

    };

  }, [connected, on, off, queryClient]);



  return null;

}


