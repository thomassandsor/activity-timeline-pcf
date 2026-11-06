// Stands in for "@griffel/react" when bundling @fluentui/react-icons (see webpack.config.js).
// The platform's Fluent library re-exports Griffel, so icons share its style engine instead of bundling a second copy.
export { __styles, __css, makeStyles, makeStaticStyles, mergeClasses } from "@fluentui/react-components";

// Only used by font-based icons, which this component doesn't use
export function __staticStyles() {
    return function useStaticStyles() {
        return undefined;
    };
}
