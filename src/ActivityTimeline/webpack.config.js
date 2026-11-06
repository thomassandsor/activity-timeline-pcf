// Merged into the pcf-scripts webpack config (enabled by pcfAllowCustomWebpack in featureconfig.json).
//
// @fluentui/react-icons isn't a platform library, so it gets bundled. Left alone it would also bundle its own copy
// of Griffel (Fluent's CSS-in-JS engine), which doesn't know the class names created by the platform's copy and
// can't resolve React 16's "react/jsx-runtime" as an ES module. The alias routes the icons to the platform's
// Griffel, re-exported by the externalized @fluentui/react-components.
const path = require("path");

module.exports = {
    resolve: {
        alias: {
            "@griffel/react$": path.resolve(__dirname, "webpack", "griffel-platform.js"),
        },
    },
};
