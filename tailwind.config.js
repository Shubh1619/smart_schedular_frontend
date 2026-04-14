/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#6759FF",
          surface: "#F8F9FF",
          text: "#1E1E2F",
          muted: "#606074"
        },
        item: {
          event: "#3B82F6",
          task: "#1F2937",
          note: "#FACC15"
        }
      },
      boxShadow: {
        card: "0 12px 34px rgba(15, 23, 42, 0.08)"
      },
      borderRadius: {
        card: "18px"
      }
    }
  },
  plugins: []
};

