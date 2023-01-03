module.exports = {
  env: {
    browser: true,
    commonjs: true,
    es2021: true
  },
  extends: [
    "eslint:recommended"
  ],
  overrides: [
  ],
  parserOptions: {
    ecmaVersion: "latest"
  },
  rules: {
    "no-undef": "off",
    "func-call-spacing": "off",
    "max-len": ["error", {
      "code": 120
    }],
    "new-parens": "error",
    "no-caller": "error",
    "no-bitwise": "off",
    "no-console": "warn",
    "no-var": "error",
    "object-curly-spacing": ["error", "never"],
    "prefer-const": "error",
    "quotes": ["error", "double"],
    "semi": "off"
  }
}
