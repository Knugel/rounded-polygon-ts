import {defineConfig} from "vite";
import { resolve } from 'path'

export default defineConfig({
    base: "./",
    build: {
        lib: {
            entry: resolve(__dirname, 'src/main.ts'),
            formats: ['esm']
        }
    },
})
