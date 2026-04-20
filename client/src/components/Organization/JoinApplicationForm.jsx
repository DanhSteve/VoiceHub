import { useCallback, useEffect, useState } from 'react';
import { GradientButton } from '../Shared';
import { organizationAPI } from '../../services/api/organizationAPI';
import { useAppStrings } from '../../locales/appStrings';

const unwrap = (payload) => payload?.data ?? payload;

/**
 * Form điền đơn gia nhập tổ chức — dùng chung cho trang riêng (và có thể bọc modal).
 */
export default function JoinApplicationForm({
  orgId,
  organizationName = '',
  onSubmitted,
  onCancel,
  showCancel = true,
}) {
  const { t } = useAppStrings();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState([]);
  const [answers, setAnswers] = useState({});

  const loadForm = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError('');
    try {
      const res = await organizationAPI.getJoinApplicationFormPublic(orgId);
      const raw = unwrap(res);
      const data = raw?.data != null ? raw.data : raw;
      const list = Array.isArray(data?.fields) ? data.fields : [];
      setFields(list);
      const init = {};
      list.forEach((f) => {
        init[f.id] = f.type === 'checkbox' ? [] : '';
      });
      setAnswers(init);
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        t('joinForm.loadError');
      setError(typeof msg === 'string' ? msg : t('joinForm.loadError'));
      setFields([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    if (orgId) loadForm();
  }, [orgId, loadForm]);

  const handleChange = (fieldId, value) => {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
  };

  const toggleCheckboxAnswer = (fieldId, option, checked) => {
    setAnswers((prev) => {
      const cur = Array.isArray(prev[fieldId]) ? [...prev[fieldId]] : [];
      if (checked) {
        if (!cur.includes(option)) cur.push(option);
      } else {
        const i = cur.indexOf(option);
        if (i >= 0) cur.splice(i, 1);
      }
      return { ...prev, [fieldId]: cur };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!orgId || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await organizationAPI.submitJoinApplication(orgId, answers);
      onSubmitted?.();
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        t('joinForm.submitFail');
      setError(typeof msg === 'string' ? msg : t('joinForm.submitFail'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 text-slate-100">
      {loading && <p className="text-sm text-gray-400">{t('joinForm.loadingForm')}</p>}
      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
      {!loading && !error && fields.length === 0 && (
        <p className="text-sm text-gray-400">{t('joinForm.emptyFields')}</p>
      )}
      {!loading && fields.length > 0 && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map((f) => (
            <div key={f.id}>
              <label className="mb-1 block text-sm font-medium text-gray-300">
                {f.label}
                {f.required ? <span className="text-red-400"> *</span> : null}
              </label>
              {f.type === 'long_text' ? (
                <textarea
                  required={f.required}
                  rows={4}
                  value={answers[f.id] ?? ''}
                  onChange={(e) => handleChange(f.id, e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-[#0b1220] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                />
              ) : f.type === 'single_choice' ? (
                <select
                  required={f.required}
                  value={answers[f.id] ?? ''}
                  onChange={(e) => handleChange(f.id, e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-[#0b1220] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                >
                  <option value="">{t('joinForm.selectPlaceholder')}</option>
                  {(f.options || []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : f.type === 'radio' ? (
                <div
                  role="radiogroup"
                  aria-label={f.label}
                  className="space-y-2 rounded-xl border border-slate-700 bg-[#0b1220]/80 px-3 py-2"
                >
                  {(f.options || []).map((opt, i) => (
                    <label
                      key={opt}
                      className="flex cursor-pointer items-center gap-2 text-sm text-gray-200"
                    >
                      <input
                        type="radio"
                        name={f.id}
                        value={opt}
                        required={Boolean(f.required && i === 0)}
                        checked={(answers[f.id] ?? '') === opt}
                        onChange={() => handleChange(f.id, opt)}
                        className="h-4 w-4 border-slate-500 text-indigo-500"
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              ) : f.type === 'checkbox' ? (
                <div
                  role="group"
                  aria-label={f.label}
                  className="space-y-2 rounded-xl border border-slate-700 bg-[#0b1220]/80 px-3 py-2"
                >
                  {(f.options || []).map((opt) => {
                    const selected = Array.isArray(answers[f.id]) && answers[f.id].includes(opt);
                    return (
                      <label
                        key={opt}
                        className="flex cursor-pointer items-center gap-2 text-sm text-gray-200"
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) => toggleCheckboxAnswer(f.id, opt, e.target.checked)}
                          className="h-4 w-4 rounded border-slate-500 text-indigo-500"
                        />
                        <span>{opt}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <input
                  type="text"
                  required={f.required}
                  value={answers[f.id] ?? ''}
                  onChange={(e) => handleChange(f.id, e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-[#0b1220] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                />
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-2">
            <GradientButton type="submit" variant="primary" disabled={submitting}>
              {submitting ? t('joinForm.submitting') : t('joinForm.submit')}
            </GradientButton>
            {showCancel && onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl border border-slate-600 px-4 py-2 text-sm text-gray-300 hover:bg-slate-800"
              >
                {t('joinForm.back')}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
