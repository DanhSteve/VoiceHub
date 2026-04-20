/**
 * Wrapper react-hot-toast — cùng theme với <Toaster> trong main.jsx.
 * Dùng notify.* khi muốn gộp duration/style mặc định; vẫn có thể import toast trực tiếp.
 */
import toast from 'react-hot-toast';

const base = { duration: 3000 };

export const notify = {
  success: (message, opts) => toast.success(message, { ...base, ...opts }),
  error: (message, opts) => toast.error(message, { ...base, ...opts }),
  info: (message, opts) =>
    toast(message, {
      ...base,
      icon: 'ℹ️',
      ...opts,
    }),
  loading: (message, opts) => toast.loading(message, { ...base, ...opts }),
  dismiss: (id) => toast.dismiss(id),
};

export default notify;
