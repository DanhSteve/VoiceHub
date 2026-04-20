import { useCallback, useMemo } from 'react';
import { useLocale } from '../context/LocaleContext';
import { mergeDeep } from './mergeDeep';
import { extraStrings } from './appStrings.extra';
import { pageStrings } from './appStrings.pages';

function getPath(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
}

/** Chuỗi giao diện VI/EN — đồng bộ với LocaleContext (cùng localStorage với nút cờ trên /) */
const STRINGS_BASE = {
  vi: {
    nav: {
      railHint: 'Đưa chuột vào để mở menu',
      brandHome: 'VoiceHub — Trang chủ',
      dashboard: { label: 'Bảng điều khiển', tooltip: 'Bảng điều khiển' },
      friends: { label: 'Chat bạn bè', tooltip: 'Tin nhắn' },
      voice: { label: 'Không gian', tooltip: 'Không gian' },
      org: { label: 'Tổ chức', tooltip: 'Tổ chức' },
      tasks: { label: 'Công việc', tooltip: 'Công việc' },
      notifications: { label: 'Thông báo', tooltip: 'Thông báo' },
      calendar: { label: 'Lịch', tooltip: 'Lịch' },
      themeLight: 'Chế độ Sáng',
      themeDark: 'Chế độ Tối',
      ariaThemeLight: 'Chuyển giao diện sáng',
      ariaThemeDark: 'Chuyển giao diện tối',
      langTitleToEn: 'Switch to English',
      langTitleToVi: 'Chuyển sang Tiếng Việt',
      ariaLang: 'Chuyển ngôn ngữ',
      profileAccount: 'Tài khoản',
      editProfile: 'Sửa hồ sơ',
      invisible: 'Chế độ vô hình',
      saving: 'Đang lưu...',
      on: 'Đang bật',
      off: 'Đang tắt',
      logout: 'Đăng xuất',
      logoutTitle: 'Đăng xuất',
      logoutMsg: 'Bạn có chắc muốn đăng xuất?',
      cancel: 'Hủy',
      toastDemoInvisible: 'Bản demo trên trang chủ — không đổi chế độ thật.',
      toastDemoLogout: 'Bản demo trên trang chủ — không đăng xuất tài khoản thật.',
      toastInvisibleErr: 'Không thể cập nhật chế độ vô hình',
    },
    authLayout: {
      home: 'Quay về trang chủ',
      login: 'Đăng nhập',
      register: 'Đăng ký',
      ariaThemeLight: 'Chuyển giao diện sáng',
      ariaThemeDark: 'Chuyển giao diện tối',
      featureCloud: 'Cloud',
      featureVoice: 'Voice',
      featureSecurity: 'Bảo mật',
    },
    authMarketing: {
      badgeSub: 'Nền tảng giao tiếp doanh nghiệp',
      h1a: 'Không gian chung để đội ngũ',
      h1b: 'nói, nghe và phối hợp — một cách rõ ràng.',
      body: 'VoiceHub gắn chat, thoại và quản trị tổ chức vào cùng một trải nghiệm: ít nhảy tab, ít công cụ rời rạc, nhiều thời gian cho việc thật sự cần làm cùng nhau.',
      quote: 'Chúng tôi thiết kế để công nghệ đứng sau — phía trước là con người và cuộc trò chuyện của họ.',
      foot: 'Kiến trúc Voice-Chat theo mô hình tổ chức; có thể triển khai linh hoạt với Docker Swarm và môi trường Cloud AWS, phù hợp chính sách nội bộ và quy mô vận hành của bạn.',
      chips: ['Đa tổ chức', 'Phân quyền theo vai trò', 'Thời gian thực'],
    },
    login: {
      title: 'Chào mừng quay lại',
      subtitle: 'Đăng nhập để tiếp tục quản trị hệ thống của bạn.',
      password: 'Mật khẩu',
      forgot: 'Quên mật khẩu?',
      placeholderPwd: 'Mật khẩu',
      hide: 'Ẩn',
      show: 'Hiện',
      remember: 'Ghi nhớ đăng nhập',
      submitting: 'Đang đăng nhập…',
      submit: 'Đăng nhập',
      demoToast: 'Đây là bản demo trên trang chủ — đăng nhập thật từ trang Đăng nhập.',
    },
    notFound: {
      title: 'Trang không tồn tại',
      cta: 'Quay về Dashboard',
    },
    dashboard: {
      searchPlaceholder: 'Tìm kiếm toàn hệ thống… (Enter)',
      ariaSearch: 'Mở tìm nhanh',
      ariaNotifications: 'Thông báo',
      kicker: 'Dashboard',
      heading: 'Trung Tâm Điều Khiển',
      sub: 'Giám sát không gian làm việc thời gian thực',
      live: 'Live',
      customize: 'Tùy chỉnh Dashboard',
      customizeToast: 'Đã cuộn tới khu vực hoạt động',
      exportReport: 'Xuất báo cáo',
      exportOk: 'Đã tải snapshot số liệu (JSON)',
      exportErr: 'Không xuất được file',
      shareOk: 'Đã copy liên kết Dashboard',
      greetingMorning: 'Chào buổi sáng, {name}',
      greetingNoon: 'Chào buổi trưa, {name}',
      greetingAfternoon: 'Chào buổi chiều, {name}',
      greetingEvening: 'Chào buổi tối, {name}',
      greetingLate: 'Khuya rồi, {name}',
      statOrg: 'Tổ chức',
      statTaskDone: 'Việc đã xong',
      statFriends: 'Bạn bè',
      statNotify: 'Thông báo',
      loading: 'Đang tải...',
      detailOrg: 'Không gian làm việc đã tham gia',
      detailTask: 'Theo tổ chức đầu tiên của bạn',
      detailFriends: '{count} lời mời đang chờ',
      detailUnread: 'Chưa đọc trên hệ thống',
      statOpenOrg: 'Mở Tổ chức',
      statOpenTasks: 'Mở Công việc',
      statOpenFriends: 'Mở Bạn bè',
      statOpenNotify: 'Mở Thông báo',
      statModalTitle: 'Chi tiết',
      viewDetails: 'Xem chi tiết →',
      newProject: 'Tạo dự án mới',
      settings: 'Cài đặt',
      shareLink: 'Chia sẻ liên kết',
      share: 'Chia sẻ',
    },
  },
  en: {
    nav: {
      railHint: 'Hover to expand menu',
      brandHome: 'VoiceHub — Home',
      dashboard: { label: 'Dashboard', tooltip: 'Dashboard' },
      friends: { label: 'Friends chat', tooltip: 'Messages' },
      voice: { label: 'Voice', tooltip: 'Voice rooms' },
      org: { label: 'Organizations', tooltip: 'Organizations' },
      tasks: { label: 'Tasks', tooltip: 'Tasks' },
      notifications: { label: 'Notifications', tooltip: 'Notifications' },
      calendar: { label: 'Calendar', tooltip: 'Calendar' },
      themeLight: 'Light mode',
      themeDark: 'Dark mode',
      ariaThemeLight: 'Switch to light theme',
      ariaThemeDark: 'Switch to dark theme',
      langTitleToEn: 'Switch to English',
      langTitleToVi: 'Switch to Vietnamese',
      ariaLang: 'Switch language',
      profileAccount: 'Account',
      editProfile: 'Edit profile',
      invisible: 'Invisible mode',
      saving: 'Saving…',
      on: 'On',
      off: 'Off',
      logout: 'Log out',
      logoutTitle: 'Log out',
      logoutMsg: 'Are you sure you want to log out?',
      cancel: 'Cancel',
      toastDemoInvisible: 'Home preview — invisible mode is not saved.',
      toastDemoLogout: 'Home preview — you are not logged out.',
      toastInvisibleErr: 'Could not update invisible mode',
    },
    authLayout: {
      home: 'Back to home',
      login: 'Log in',
      register: 'Sign up',
      ariaThemeLight: 'Switch to light theme',
      ariaThemeDark: 'Switch to dark theme',
      featureCloud: 'Cloud',
      featureVoice: 'Voice',
      featureSecurity: 'Security',
    },
    authMarketing: {
      badgeSub: 'Enterprise communication platform',
      h1a: 'One place for your team to',
      h1b: 'speak, listen, and collaborate — clearly.',
      body: 'VoiceHub brings chat, voice, and org management into one experience: fewer tab hops, fewer scattered tools, more time for real work together.',
      quote: 'We design so technology stays behind — people and their conversations stay in front.',
      foot: 'Voice–chat architecture aligned to your organization; deploy flexibly with Docker Swarm and AWS cloud to match internal policy and scale.',
      chips: ['Multi-org', 'Role-based access', 'Real-time'],
    },
    login: {
      title: 'Welcome back',
      subtitle: 'Sign in to continue managing your workspace.',
      password: 'Password',
      forgot: 'Forgot password?',
      placeholderPwd: 'Password',
      hide: 'Hide',
      show: 'Show',
      remember: 'Remember me',
      submitting: 'Signing in…',
      submit: 'Log in',
      demoToast: 'This is the home preview — sign in from the Log in page for real auth.',
    },
    notFound: {
      title: 'Page not found',
      cta: 'Back to Dashboard',
    },
    dashboard: {
      searchPlaceholder: 'Search everywhere… (Enter)',
      ariaSearch: 'Open quick search',
      ariaNotifications: 'Notifications',
      kicker: 'Dashboard',
      heading: 'Control Center',
      sub: 'Monitor your workspace in real time',
      live: 'Live',
      customize: 'Customize dashboard',
      customizeToast: 'Scrolled to activity section',
      exportReport: 'Export report',
      exportOk: 'Downloaded metrics snapshot (JSON)',
      exportErr: 'Could not export file',
      shareOk: 'Dashboard link copied',
      greetingMorning: 'Good morning, {name}',
      greetingNoon: 'Good afternoon, {name}',
      greetingAfternoon: 'Good afternoon, {name}',
      greetingEvening: 'Good evening, {name}',
      greetingLate: 'Working late, {name}',
      statOrg: 'Organizations',
      statTaskDone: 'Tasks done',
      statFriends: 'Friends',
      statNotify: 'Notifications',
      loading: 'Loading…',
      detailOrg: 'Workspaces you belong to',
      detailTask: 'From your first organization',
      detailFriends: '{count} pending invites',
      detailUnread: 'Unread across the app',
      statOpenOrg: 'Open Organizations',
      statOpenTasks: 'Open Tasks',
      statOpenFriends: 'Open Friends',
      statOpenNotify: 'Open Notifications',
      statModalTitle: 'Details',
      viewDetails: 'View details →',
      newProject: 'New project',
      settings: 'Settings',
      shareLink: 'Share link',
      share: 'Share',
    },
  },
};

const STRINGS = {
  vi: mergeDeep(mergeDeep(STRINGS_BASE.vi, extraStrings.vi), pageStrings.vi),
  en: mergeDeep(mergeDeep(STRINGS_BASE.en, extraStrings.en), pageStrings.en),
};

export function useAppStrings() {
  const { locale, toggleLocale, setLocale } = useLocale();
  const dict = useMemo(() => STRINGS[locale] || STRINGS.vi, [locale]);

  const t = useCallback(
    (path, vars) => {
      let s = getPath(dict, path);
      if (s == null) s = getPath(STRINGS.vi, path);
      if (s == null) return path;
      if (vars && typeof s === 'string') {
        return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ''));
      }
      return s;
    },
    [dict]
  );

  return { t, locale, toggleLocale, setLocale, dict };
}

export { STRINGS };
