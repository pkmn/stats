import pkmn from "@pkmn/eslint-config";

export default [...pkmn, {
  files: ["workflows/**/*.ts"],
  rules: {
    "@typescript-eslint/no-floating-promises": ["error", {ignoreVoid: true}],
    "@typescript-eslint/require-await": "off"
  }
}, {
  files: ["workflows/pkmn/*.ts"],
  languageOptions: { parserOptions: {project: ["./tsconfig.pkmn.json"]} },
}];
