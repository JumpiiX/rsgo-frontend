export default [
    {
        files: ["src/**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {

                window: "readonly",
                document: "readonly",
                console: "readonly",
                setTimeout: "readonly",
                setInterval: "readonly",
                clearTimeout: "readonly",
                clearInterval: "readonly",
                requestAnimationFrame: "readonly",
                WebSocket: "readonly",
                XMLHttpRequest: "readonly",
                fetch: "readonly",
                location: "readonly",
                navigator: "readonly",
                Image: "readonly",
                Audio: "readonly",

                THREE: "readonly"
            }
        },
        rules: {
            "no-unused-vars": ["warn", { "args": "none", "varsIgnorePattern": "^_" }],
            "no-undef": "error",
            "no-console": "off",
            "semi": ["error", "always"],
            "quotes": ["warn", "single", { "allowTemplateLiterals": true }],
            "indent": ["warn", 4],
            "no-trailing-spaces": "warn",
            "eol-last": "warn",
            "prefer-const": "warn",
            "no-var": "error"
        }
    }
];