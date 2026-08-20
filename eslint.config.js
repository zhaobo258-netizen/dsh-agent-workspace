export default [
  {
    files: ["src/**/*.js", "test/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module"
    },
    rules: {
      "no-empty": "error",
      "no-unused-vars": "error"
    }
  }
];
