/**
 * Chuỗi giao diện trang landing Home — hỗ trợ vi / en.
 * Dùng trong HomePage.jsx (và mock preview).
 */

const FEATURES_VI = [
  {
    id: 'auth',
    icon: '🔐',
    title: 'Xác thực & phân quyền',
    summary: 'Đăng nhập an toàn, phiên làm việc rõ ràng theo tổ chức.',
    badge: 'Bảo mật',
    color: 'from-cyan-600 to-teal-600',
    detail: {
      intro:
        'VoiceHub xây dựng lớp xác thực phù hợp môi trường doanh nghiệp: tài khoản quản lý tập trung, phân quyền theo ngữ cảnh tổ chức và luồng đăng nhập ổn định.',
      bullets: [
        'Phiên đăng nhập gắn với tổ chức và quyền truy cập từng khu vực trong ứng dụng.',
        'Tách rõ luồng công khai (landing) và luồng nội bộ sau đăng nhập.',
        'Sẵn sàng mở rộng theo chính sách IT: xác minh email, mật khẩu, v.v.',
      ],
      tags: ['JWT', 'Phân quyền', 'Tổ chức'],
    },
  },
  {
    id: 'control',
    icon: '🎯',
    title: 'Bảng điều khiển',
    summary: 'Tổng quan thông báo, lời mời và lối vào từng mô-đun.',
    badge: 'Điều hướng',
    color: 'from-blue-500 to-cyan-500',
    detail: {
      intro:
        'Bảng điều khiển giúp bạn nắm tình hình nhanh: hoạt động gần đây, lời mời, thông báo và đường vào chat, tổ chức, công việc.',
      bullets: [
        'Tổng quan trực quan thay vì menu khô khan.',
        'Điểm xuất phát thống nhất trước khi đi sâu từng luồng nghiệp vụ.',
        'Phù hợp đội vận hành cần “nhìn một cái là biết việc gì đang chờ”.',
      ],
      tags: ['Tổng quan', 'Thông báo'],
    },
  },
  {
    id: 'chat',
    icon: '💬',
    title: 'Nhắn tin thời gian thực',
    summary: 'Kênh nội bộ, đồng bộ nhanh, gắn với ngữ cảnh tổ chức.',
    badge: 'Realtime',
    color: 'from-green-500 to-emerald-500',
    detail: {
      intro:
        'Trao đổi tin nhắn theo thời gian thực: cá nhân, nhóm và kênh làm việc — giảm email dài và chat tách rời công việc.',
      bullets: [
        'Luồng tin rõ ràng khi nhiều hội thoại song song.',
        'Gắn với danh bạ và không gian tổ chức.',
        'Hướng tới độ trễ thấp và trải nghiệm ổn định.',
      ],
      tags: ['Socket', 'REST', 'Kênh'],
    },
  },
  {
    id: 'voice',
    icon: '🎤',
    title: 'Họp trực tuyến',
    summary: 'Phòng thoại và họp khi chữ chưa đủ — WebRTC nội bộ.',
    badge: 'WebRTC',
    color: 'from-orange-500 to-red-500',
    detail: {
      intro:
        'Phòng họp nhanh, chất lượng ổn định: họp đứng, họp dự án ngắn hoặc hỗ trợ từ xa trong cùng ngữ cảnh với chat.',
      bullets: [
        'Ưu tiên chất lượng thoại trong môi trường nội bộ.',
        'Chuyển từ nhắn tin sang họp khi cần.',
        'Kiểm soát truy cập theo phòng và quyền.',
      ],
      tags: ['Họp nhanh', 'Nội bộ'],
    },
  },
  {
    id: 'org',
    icon: '🏢',
    title: 'Quản lý đội nhóm & tổ chức',
    summary: 'Cấu trúc tổ chức, kênh và thành viên — quyền hạn đúng phân cấp.',
    badge: 'Đa tổ chức',
    color: 'from-teal-500 to-cyan-600',
    detail: {
      intro:
        'Mô hình hóa tổ chức, thành viên và không gian làm việc để dữ liệu và quyền đi đúng “đường ray”.',
      bullets: [
        'Tách bạch không gian theo tổ chức, giảm nhiễu.',
        'Kênh phản ánh cách làm việc thực tế.',
        'Quy trình gia nhập phù hợp IT/HR.',
      ],
      tags: ['Org', 'Kênh'],
    },
  },
  {
    id: 'documents',
    icon: '📁',
    title: 'Chia sẻ tài liệu',
    summary: 'File trong ngữ cảnh hội thoại, quyền xem rõ ràng.',
    badge: 'File',
    color: 'from-teal-500 to-green-500',
    detail: {
      intro:
        'Tài liệu đi cùng trao đổi: đính kèm trong luồng chat, truy cập theo quyền — hạn chế file “lạc” giữa các kênh.',
      bullets: [
        'Giảm nhảy giữa drive cá nhân và chat.',
        'Kiểm soát phiên bản và quyền xem theo thành viên.',
        'Phù hợp spec, báo cáo tiến độ, hợp đồng ngắn.',
      ],
      tags: ['File', 'Quyền'],
    },
  },
  {
    id: 'tasks',
    icon: '✅',
    title: 'Công việc',
    summary: 'Tác vụ và tiến độ (mô-đun mở rộng trong hệ thống).',
    badge: 'Tasks',
    color: 'from-indigo-500 to-purple-500',
    detail: {
      intro: 'Gắn trao đổi với việc cần làm: trạng thái, hạn và trách nhiệm rõ ràng.',
      bullets: ['Bảng hoặc danh sách tùy quy trình.', 'Nhắc hạn và ưu tiên.', 'Phù hợp nhóm sản phẩm và vận hành.'],
      tags: ['Kanban'],
    },
  },
  {
    id: 'friends',
    icon: '👥',
    title: 'Liên hệ',
    summary: 'Lời mời và kết nối có kiểm soát.',
    badge: 'Mạng liên hệ',
    color: 'from-yellow-500 to-orange-500',
    detail: {
      intro: 'Kết nối đối tác và cộng sự ngoài biên tổ chức một cách chuyên nghiệp.',
      bullets: ['Lời mời rõ nguồn.', 'Tách liên hệ cá nhân và không gian tổ chức.', 'Tránh spam mời.'],
      tags: ['Lời mời'],
    },
  },
];

const FEATURES_EN = [
  {
    id: 'auth',
    icon: '🔐',
    title: 'Authentication & access',
    summary: 'Secure sign-in and sessions scoped to your organization.',
    badge: 'Security',
    color: 'from-cyan-600 to-teal-600',
    detail: {
      intro:
        'VoiceHub provides enterprise-friendly authentication: centralized accounts, contextual permissions per organization, and stable login flows.',
      bullets: [
        'Sessions tied to org membership and access to each area of the app.',
        'Clear separation between public (marketing) and internal post-login flows.',
        'Ready to extend with IT policies: email verification, passwords, and more.',
      ],
      tags: ['JWT', 'RBAC', 'Org'],
    },
  },
  {
    id: 'control',
    icon: '🎯',
    title: 'Dashboard',
    summary: 'Notifications, invites, and entry points to every module.',
    badge: 'Navigation',
    color: 'from-blue-500 to-cyan-500',
    detail: {
      intro:
        'The dashboard gives you situational awareness: recent activity, invites, notifications, and paths into chat, org, and work.',
      bullets: [
        'Visual overview instead of a dry menu.',
        'A single front door before diving into each workflow.',
        'Great for ops teams who need to see what is waiting at a glance.',
      ],
      tags: ['Overview', 'Notifications'],
    },
  },
  {
    id: 'chat',
    icon: '💬',
    title: 'Real-time messaging',
    summary: 'Internal channels, fast sync, tied to org context.',
    badge: 'Realtime',
    color: 'from-green-500 to-emerald-500',
    detail: {
      intro:
        'Message in real time: DMs, groups, and work channels — fewer long email threads and chat divorced from work.',
      bullets: [
        'Clear threads when many conversations run in parallel.',
        'Connected to directory and org workspaces.',
        'Designed for low latency and a stable experience.',
      ],
      tags: ['Socket', 'REST', 'Channels'],
    },
  },
  {
    id: 'voice',
    icon: '🎤',
    title: 'Online meetings',
    summary: 'Voice rooms when text is not enough — internal WebRTC.',
    badge: 'WebRTC',
    color: 'from-orange-500 to-red-500',
    detail: {
      intro:
        'Quick rooms with reliable quality: standups, short project syncs, or remote support in the same context as chat.',
      bullets: [
        'Voice quality tuned for internal collaboration.',
        'Jump from chat to a meeting when a decision is needed.',
        'Access control per room and role.',
      ],
      tags: ['Quick calls', 'Internal'],
    },
  },
  {
    id: 'org',
    icon: '🏢',
    title: 'Teams & organizations',
    summary: 'Org structure, channels, and members — permissions that match hierarchy.',
    badge: 'Multi-org',
    color: 'from-teal-500 to-cyan-600',
    detail: {
      intro:
        'Model organizations, members, and workspaces so data and permissions stay on the right rails.',
      bullets: [
        'Separate spaces per organization to reduce noise.',
        'Channels that mirror how you actually work.',
        'Join flows that fit IT and HR.',
      ],
      tags: ['Org', 'Channels'],
    },
  },
  {
    id: 'documents',
    icon: '📁',
    title: 'Document sharing',
    summary: 'Files in conversation context with clear view rights.',
    badge: 'Files',
    color: 'from-teal-500 to-green-500',
    detail: {
      intro:
        'Documents travel with the conversation: attachments in chat, access by permission — fewer files lost between channels.',
      bullets: [
        'Less jumping between personal drives and chat.',
        'Version and view rights per member.',
        'Great for specs, status reports, and short contracts.',
      ],
      tags: ['Files', 'Permissions'],
    },
  },
  {
    id: 'tasks',
    icon: '✅',
    title: 'Tasks',
    summary: 'Work items and progress (extensible module in the system).',
    badge: 'Tasks',
    color: 'from-indigo-500 to-purple-500',
    detail: {
      intro: 'Tie conversation to work: status, due dates, and ownership stay visible.',
      bullets: ['Boards or lists to match your process.', 'Reminders and priorities.', 'Great for product and ops teams.'],
      tags: ['Kanban'],
    },
  },
  {
    id: 'friends',
    icon: '👥',
    title: 'Contacts',
    summary: 'Invites and connections with guardrails.',
    badge: 'Network',
    color: 'from-yellow-500 to-orange-500',
    detail: {
      intro: 'Connect partners and collaborators outside the org boundary in a professional way.',
      bullets: ['Invites with a clear source.', 'Separate personal contacts from org space.', 'Reduce invite spam.'],
      tags: ['Invites'],
    },
  },
];

export const HOME_LOCALES = {
  vi: {
    features: FEATURES_VI,
    nav: {
      tagline: 'Giao tiếp nội bộ doanh nghiệp',
      login: 'Đăng nhập',
      register: 'Đăng ký',
      enterApp: 'Vào hệ thống',
    },
    a11y: {
      themeUseLight: 'Chuyển sang chế độ sáng',
      themeUseDark: 'Chuyển sang chế độ tối',
      languageSwitch: 'Chuyển ngôn ngữ',
    },
    langTooltip: {
      toEn: 'Switch to English',
      toVi: 'Chuyển sang Tiếng Việt',
    },
    hero: {
      badge: 'Nền tảng cộng tác nội bộ',
      titleBefore: 'VoiceHub —',
      titleGradient: 'giao tiếp và phối hợp',
      titleAfter: 'cho doanh nghiệp hiện đại',
      desc:
        'Tập trung nhắn tin, cuộc họp, quản lý nhóm, tài liệu và cộng tác thời gian thực trong một hệ sinh thái thống nhất — ít công cụ rời rạc, nhiều việc xong đúng hạn.',
      ctaPrimary: 'Trải nghiệm hệ thống',
      ctaSecondary: 'Xem tính năng',
      footnote:
        'Đây là trang giới thiệu sản phẩm — không dẫn thẳng vào màn hình nội bộ. Sau đăng nhập, bảng điều khiển sẽ hướng dẫn bạn chuyển tiếp tới từng chức năng.',
    },
    problem: {
      labelProblem: 'Vấn đề',
      titleProblem: 'Công cụ rời rạc làm chậm đội ngũ',
      bodyProblem:
        'Doanh nghiệp thường phải dùng quá nhiều ứng dụng: chat, họp, quản lý nhóm, chia sẻ tài liệu. Dữ liệu phân mảnh, khó phối hợp và dễ mất ngữ cảnh — hiệu suất giảm, người mới onboard lâu.',
      labelSolution: 'Giải pháp',
      titleSolution: 'VoiceHub hợp nhất toàn bộ quy trình cộng tác',
      bodySolution:
        'Một nền tảng duy nhất cho giao tiếp và phối hợp nội bộ: từ xác thực tới chat, họp, tổ chức và tài liệu — cùng một trải nghiệm, cùng một điểm vào sau đăng nhập.',
    },
    featuresSection: {
      kicker: 'Luồng trải nghiệm',
      title: 'Khám phá từng lớp giá trị',
      subtitle: `Di chuột từng bước để xem giao diện thật (thu nhỏ) từ cùng mã nguồn ứng dụng — có thể tương tác trong khung xem trước.

Địa chỉ trang không đổi; không ghi dữ liệu lên máy chủ. Nhấn bước để xem chi tiết trong cửa sổ.`,
      clickHint: 'Nhấn để đọc chi tiết →',
    },
    storySteps: [
      { step: '01', headline: 'Xác thực & đăng nhập bảo mật', teaser: 'Phiên làm việc và phân quyền theo tổ chức.', featureId: 'auth' },
      { step: '02', headline: 'Trung tâm điều khiển', teaser: 'Một cửa ngõ sau khi bạn đăng nhập.', featureId: 'control' },
      { step: '03', headline: 'Nhắn tin thời gian thực', teaser: 'Kênh nội bộ, đồng bộ nhanh.', featureId: 'chat' },
      { step: '04', headline: 'Họp trực tuyến', teaser: 'Thoại và họp khi cần quyết định nhanh.', featureId: 'voice' },
      { step: '05', headline: 'Quản lý đội nhóm & tổ chức', teaser: 'Cấu trúc kênh và thành viên rõ ràng.', featureId: 'org' },
      { step: '06', headline: 'Công việc & tiến độ', teaser: 'Việc cần làm, hạn chót và trách nhiệm gắn tổ chức — từ bảng điều khiển.', featureId: 'tasks' },
    ],
    userJourney: {
      title: 'Hành trình sau đăng nhập',
      subtitle: 'Bốn bước rõ ràng — người dùng luôn biết mình đang ở đâu và bước tiếp theo là gì.',
      steps: [
        { title: 'Đăng nhập an toàn', desc: 'Xác thực và chọn không gian làm việc.' },
        { title: 'Vào bảng điều khiển', desc: 'Tổng quan thông báo và lối vào mô-đun.' },
        { title: 'Chọn chức năng', desc: 'Chat, họp, tổ chức hoặc tài liệu theo vai trò.' },
        { title: 'Cộng tác thời gian thực', desc: 'Làm việc thống nhất, không nhảy công cụ rời rạc.' },
      ],
    },
    tech: {
      kicker: 'Niềm tin kỹ thuật',
      title: 'Xây dựng trên nền tảng công nghệ hiện đại',
    },
    finalCta: {
      title: 'Sẵn sàng nâng cấp trải nghiệm cộng tác nội bộ?',
      body:
        'Đăng nhập để bắt đầu sử dụng hệ thống VoiceHub — mọi chức năng thực tế mở từ bảng điều khiển sau khi bạn xác thực.',
      login: 'Đăng nhập vào hệ thống',
      register: 'Tạo tài khoản',
      openDashboard: 'Mở bảng điều khiển',
    },
    modal: {
      footerNote:
        'Sau đăng nhập, bảng điều khiển là điểm bắt đầu — từ đó bạn chọn chat, họp, tổ chức hoặc tài liệu theo vai trò.',
      goDashboard: 'Vào bảng điều khiển',
      register: 'Đăng ký',
      login: 'Đăng nhập',
    },
      mock: {
        floating: {
          live: 'Live',
          tiles: ['Chat', 'Họp', 'Task'],
          messages: 'Tin nhắn',
          activity: 'Hoạt động',
          callLine: 'Cuộc gọi đang chờ — tham gia',
          join: 'Tham gia',
        },
      },
  },
  en: {
    features: FEATURES_EN,
    nav: {
      tagline: 'Internal communication for teams',
      login: 'Log in',
      register: 'Sign up',
      enterApp: 'Open app',
    },
    a11y: {
      themeUseLight: 'Switch to light mode',
      themeUseDark: 'Switch to dark mode',
      languageSwitch: 'Switch language',
    },
    langTooltip: {
      toEn: 'Switch to English',
      toVi: 'Switch to Vietnamese',
    },
    hero: {
      badge: 'Internal collaboration platform',
      titleBefore: 'VoiceHub —',
      titleGradient: 'communication and coordination',
      titleAfter: 'for modern businesses',
      desc:
        'Bring messaging, meetings, team management, documents, and real-time collaboration into one unified workspace — fewer scattered tools, more work shipped on time.',
      ctaPrimary: 'Try the product',
      ctaSecondary: 'Explore features',
      footnote:
        'This is a marketing page — it does not drop you into internal tools. After sign-in, the dashboard guides you to each feature.',
    },
    problem: {
      labelProblem: 'The problem',
      titleProblem: 'Fragmented tools slow teams down',
      bodyProblem:
        'Teams juggle too many apps: chat, meetings, org management, and documents. Data splits across tools, context gets lost, onboarding drags — and productivity suffers.',
      labelSolution: 'The solution',
      titleSolution: 'VoiceHub unifies the whole collaboration flow',
      bodySolution:
        'One platform for internal communication and coordination: from authentication to chat, meetings, org structure, and files — one experience and one entry point after login.',
    },
    featuresSection: {
      kicker: 'Product story',
      title: 'Explore each layer of value',
      subtitle: `Hover a step to preview the real UI (scaled) from the same app source — you can interact inside the preview frame.

The page URL does not change; nothing is persisted on the server. Click a step for details in the modal.`,
      clickHint: 'Click for details →',
    },
    storySteps: [
      { step: '01', headline: 'Secure authentication & sign-in', teaser: 'Sessions and permissions scoped to your organization.', featureId: 'auth' },
      { step: '02', headline: 'Control center', teaser: 'Your single entry after you sign in.', featureId: 'control' },
      { step: '03', headline: 'Real-time messaging', teaser: 'Internal channels with fast sync.', featureId: 'chat' },
      { step: '04', headline: 'Online meetings', teaser: 'Voice and rooms when decisions need to be fast.', featureId: 'voice' },
      { step: '05', headline: 'Teams & organization', teaser: 'Clear channels and membership.', featureId: 'org' },
      { step: '06', headline: 'Tasks & progress', teaser: 'Work items, deadlines, and ownership tied to your org — from the dashboard.', featureId: 'tasks' },
    ],
    userJourney: {
      title: 'Your journey after sign-in',
      subtitle: 'Four clear steps — always know where you are and what comes next.',
      steps: [
        { title: 'Secure sign-in', desc: 'Authenticate and choose your workspace.' },
        { title: 'Open the dashboard', desc: 'Notifications overview and module entry points.' },
        { title: 'Pick a feature', desc: 'Chat, meetings, org, or documents by role.' },
        { title: 'Collaborate in real time', desc: 'One workflow — fewer tool hops.' },
      ],
    },
    tech: {
      kicker: 'Engineering trust',
      title: 'Built on a modern stack',
    },
    finalCta: {
      title: 'Ready to level up internal collaboration?',
      body:
        'Sign in to start using VoiceHub — every real feature opens from the dashboard once you are authenticated.',
      login: 'Log in to the system',
      register: 'Create an account',
      openDashboard: 'Open dashboard',
    },
    modal: {
      footerNote:
        'After sign-in, the dashboard is your home — from there you choose chat, meetings, org, or documents by role.',
      goDashboard: 'Go to dashboard',
      register: 'Sign up',
      login: 'Log in',
    },
      mock: {
        floating: {
          live: 'Live',
          tiles: ['Chat', 'Meet', 'Task'],
          messages: 'Messages',
          activity: 'Activity',
          callLine: 'Incoming call — join',
          join: 'Join',
        },
      },
  },
};
