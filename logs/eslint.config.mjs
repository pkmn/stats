import pkmn from "@pkmn/eslint-config";

export default [...pkmn, {
  files: ["src/storage.ts"],
  rules: {"@typescript-eslint/require-await": "off"},
}];
