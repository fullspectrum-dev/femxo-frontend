import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";
import "@femxo/ui/testing/dialog-polyfill";

// The first screen of a test file can be slow to appear while many files run at once.
configure({ asyncUtilTimeout: 5000 });

afterEach(cleanup);
