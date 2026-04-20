import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

/**
 * Khi nhúng trang trong landing (`landingDemo`), chặn điều hướng thật — chỉ báo toast.
 */
export function useLandingSafeNavigate(landingDemo) {
  const browserNavigate = useNavigate();
  return useCallback(
    (to, opts) => {
      if (landingDemo) {
        toast('Bản demo trên trang chủ — mở tính năng thật sau khi đăng nhập.', { icon: '🔒' });
        return;
      }
      return browserNavigate(to, opts);
    },
    [landingDemo, browserNavigate]
  );
}
