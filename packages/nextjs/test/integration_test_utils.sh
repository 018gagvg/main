function link_package() {
  local package_abs_path=$1
  local package_name=$2

  echo "Setting up @sentry/${package_name} for linking"
  pushd $package_abs_path
  yarn link
  popd

  echo "Linking @sentry/$package_name"
  yarn link "@sentry/$package_name"

}

# Note: CLI_REPO and WEBPACK_PLUGIN_REPO in the functions below should be set to the absolute path of each local repo

function linkcli() {
  if [[ $LINK_CLI ]]; then
    if [[ $CLI_REPO ]]; then
      link_package $CLI_REPO "cli"
    else
      echo "Can't link @sentry/cli because CLI_REPO is not set."
    fi
  fi
}

function linkplugin() {
  if [[ $LINK_PLUGIN ]]; then
    if [[ $WEBPACK_PLUGIN_REPO ]]; then
      link_package $WEBPACK_PLUGIN_REPO "webpack-plugin"

      # the webpack plugin depends on `@sentry/cli`, so if we're using a linked version of the cli package, the plugin
      # needs to link to it, too
      if [[ $LINK_CLI ]]; then
        pushd $WEBPACK_PLUGIN_REPO
        link_cli
        popd
      fi
    else
      echo "Can't link @sentry/wepack-plugin because WEBPACK_PLUGIN_REPO is not set."
    fi
  fi
}
