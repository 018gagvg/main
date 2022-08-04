/**
 * This loader auto-wraps a user's page-level data-fetching functions (`getStaticPaths`, `getStaticProps`, and
 * `getServerSideProps`) in order to instrument them for tracing. At a high level, this is done by finding the relevant
 * functions, renaming them so as not to create a name collision, and then creating a new version of each function which
 * is a wrapped version of the original. We do this by parsing the user's code and some template code into ASTs,
 * manipulating them, and then turning them back into strings and appending our template code to the user's (modified)
 * page code. Greater detail and explanations can be found in situ in the functions below and in the helper functions in
 * `ast.ts`.
 */

import { logger } from '@sentry/utils';
import * as fs from 'fs';
import * as path from 'path';

import { isESM } from '../../utils/isESM';
import type { AST } from './ast';
import { findDeclarations, findExports, makeAST, removeComments, renameIdentifiers } from './ast';
import type { LoaderThis } from './types';

// Map to keep track of each function's placeholder in the template and what it should be replaced with. (The latter
// will get added as we process the user code. Setting it to an empty string here means TS won't complain when we set it
// to a non-empty string later.)
const DATA_FETCHING_FUNCTIONS = {
  getServerSideProps: { placeholder: '__ORIG_GSSP__', alias: '' },
  getStaticProps: { placeholder: '__ORIG_GSPROPS__', alias: '' },
  getStaticPaths: { placeholder: '__ORIG_GSPATHS__', alias: '' },
};

type LoaderOptions = {
  projectDir: string;
};

/**
 * Find any data-fetching functions the user's code contains and rename them to prevent clashes, then whittle the
 * template exporting wrapped versions instead down to only the functions found.
 *
 * @param userCode The source code of the current page file
 * @param templateCode The source code of the full template, including all functions
 * @param filepath The path to the current pagefile, within the project directory
 * @returns A tuple of modified user and template code
 */
function wrapFunctions(userCode: string, templateCode: string, filepath: string): string[] {
  let userAST: AST, templateAST: AST;
  const isTS = new RegExp('\\.tsx?$').test(filepath);

  try {
    userAST = makeAST(userCode, isTS);
    templateAST = makeAST(templateCode, false);
  } catch (err) {
    logger.warn(`Couldn't add Sentry to ${filepath} because there was a parsing error: ${err}`);
    // Replace the template code with an empty string, so in the end the user code is untouched
    return [userCode, ''];
  }

  // Comments are useful to have in the template for anyone reading it, but don't make sense to be injected into user
  // code, because they're about the template-i-ness of the template, not the code itself
  // TODO: Move this to our rollup build
  removeComments(templateAST);

  for (const functionName of Object.keys(DATA_FETCHING_FUNCTIONS)) {
    // Find and rename all identifiers whose name is `functionName`
    const alias = renameIdentifiers(userAST, functionName);

    // `alias` will be defined iff the user code contains the function in question and renaming has been done
    if (alias) {
      // We keep track of the alias for each function, so that later on we can fill it in for the placeholder in the
      // template. (Not doing that now because it's much more easily done once the template code has gone back to being
      // a string.)
      DATA_FETCHING_FUNCTIONS[functionName as keyof typeof DATA_FETCHING_FUNCTIONS].alias = alias;
    }

    // Otherwise, if the current function doesn't exist anywhere in the user's code, delete the code in the template
    // wrapping that function
    //
    // Note: We start with all of the possible wrapper lines in the template and delete the ones we don't need (rather
    // than starting with none and adding in the ones we do need) because it allows them to live in our souce code as
    // *code*. If we added them in, they'd have to be strings containing code, and we'd lose all of the benefits of
    // syntax highlighting, linting, etc.
    else {
      // We have to look for declarations and exports separately because when we build the SDK, Rollup turns
      //     export const XXX = ...
      // into
      //     const XXX = ...
      //     export { XXX }
      findExports(templateAST, functionName).remove();
      findDeclarations(templateAST, functionName).remove();
    }
  }

  return [userAST.toSource(), templateAST.toSource()];
}

/**
 * Wrap `getStaticPaths`, `getStaticProps`, and `getServerSideProps` (if they exist) in the given page code
 */
export default function wrapDataFetchersLoader(this: LoaderThis<LoaderOptions>, userCode: string): string {
  // We know one or the other will be defined, depending on the version of webpack being used
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const { projectDir } = this.getOptions ? this.getOptions() : this.query!;

  // For now this loader only works for ESM code
  if (!isESM(userCode)) {
    return userCode;
  }

  // If none of the functions we want to wrap appears in the page's code, there's nothing to do. (Note: We do this as a
  // simple substring match (rather than waiting until we've parsed the code) because it's meant to be an
  // as-fast-as-possible fail-fast. It's possible for user code to pass this check, even if it contains none of the
  // functions in question, just by virtue of the correct string having been found, be it in a comment, as part of a
  // longer variable name, etc. That said, when we actually do the code manipulation we'll be working on the code's AST,
  // meaning we'll be able to differentiate between code we actually want to change and any false positives which might
  // come up here.)
  if (Object.keys(DATA_FETCHING_FUNCTIONS).every(functionName => !userCode.includes(functionName))) {
    return userCode;
  }

  const templatePath = path.resolve(__dirname, '../templates/dataFetchersLoaderTemplate.js');
  // make sure the template is included when runing `webpack watch`
  this.addDependency(templatePath);

  const templateCode = fs.readFileSync(templatePath).toString();

  const [modifiedUserCode, modifiedTemplateCode] = wrapFunctions(
    userCode,
    templateCode,
    // Relative path to the page we're currently processing, for use in error messages
    path.relative(projectDir, this.resourcePath),
  );

  // Fill in template placeholders
  let injectedCode = modifiedTemplateCode;
  for (const { placeholder, alias } of Object.values(DATA_FETCHING_FUNCTIONS)) {
    injectedCode = injectedCode.replace(placeholder, alias);
  }

  return `${modifiedUserCode}\n${injectedCode}`;
}
