module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Keep symlinked shared types under src/ so CRA loaders apply
      webpackConfig.resolve.symlinks = false;
      return webpackConfig;
    },
  },
};
