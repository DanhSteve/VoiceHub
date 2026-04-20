const GradientButton = ({ children, onClick, variant = "primary", className = "", icon = null, disabled = false, type = "button", ...rest }) => {
  const variants = {
    primary: "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700",
    /** Cùng tông shell (cyan/teal) — Tasks, CTA thống nhất light mode */
    shell: "bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700",
    secondary: "bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600",
    success: "bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600",
    warm: "bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600",
    /** Tím → xanh: nút "Thêm bạn" / kết bạn */
    friend: "bg-gradient-to-r from-violet-500 to-blue-600 hover:from-violet-600 hover:to-blue-700",
  };
  
  return (
    <button 
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${variants[variant]} px-6 py-3 rounded-xl font-semibold text-white shadow-lg transition-all duration-300 hover:shadow-2xl hover:scale-105 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${className}`}
      {...rest}
    >
      {icon && <span className="text-xl">{icon}</span>}
      {children}
    </button>
  );
};

export default GradientButton;
