const path = require('path');

module.exports = {
  entry: {
    background: './src/background/index-refactored.ts',
    content: './src/content/index.ts',
    sidebar: './src/sidebar/index.ts',
    options: './src/options/index.ts'
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  mode: 'development',
  devtool: 'cheap-module-source-map',
};