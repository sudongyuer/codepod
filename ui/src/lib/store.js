import { configureStore, createAsyncThunk } from "@reduxjs/toolkit";

import { createSlice } from "@reduxjs/toolkit";
import { io } from "socket.io-client";
import { customAlphabet } from "nanoid";
import { nolookalikes } from "nanoid-dictionary";

import wsMiddleware from "./ws/middleware";
import podQueueMiddleware from "./remote/middleware";
import loadReducers from "./remote/load";
import wsReducers from "./ws/reducers";
import podReducers from "./reducers/pod";
import exportReducers from "./reducers/export";
import runtimeReducers from "./reducers/runtime";
import { hashPod } from "./utils";

// import actions and export them
import remoteReducers from "./remote/update";
import queueReducers from "./remote/queue";

export { remoteUpdateAllPods, remoteUpdatePod } from "./remote/update";

// FIXME safety
const nanoid = customAlphabet(nolookalikes, 10);

// TODO use a selector to compute and retrieve the status
// TODO this need to cooperate with syncing indicator
export function selectIsDirty(id) {
  return (state) => {
    let pod = state.repo.pods[id];
    if (pod.remoteHash === hashPod(pod)) {
      return false;
    } else {
      return true;
    }
  };
}

function mapPods(pods, func) {
  function helper(id) {
    let pod = pods[id];
    if (id !== "ROOT") {
      func(pod);
    }
    pod.children.map(helper);
  }
  helper("ROOT");
}

// FIXME performance
export function selectNumDirty() {
  return (state) => {
    let res = 0;
    if (state.repo.repoLoaded) {
      mapPods(state.repo.pods, (pod) => {
        if (pod.remoteHash !== hashPod(pod)) {
          res += 1;
        }
      });
    }
    return res;
  };
}

export const repoSlice = createSlice({
  name: "repo",
  // TODO load from server
  initialState: {
    reponame: null,
    username: null,
    repoLoaded: false,
    pods: {},
    queue: [],
    // sessionId: nanoid(),
    sessionId: null,
    sessionRuntime: {},
    runtimeConnected: false,
    kernels: {
      julia: {
        status: null,
      },
      racket: {
        status: null,
      },
      python: {
        status: null,
      },
      javascript: {
        status: null,
      },
      // ts: {
      //   status: "NA",
      // },
    },
    queueProcessing: false,
  },
  reducers: {
    resetSessionId: (state, action) => {
      state.sessionId = nanoid();
    },
    setSessionId: (state, action) => {
      state.sessionId = action.payload;
    },
    ensureSessionRuntime: (state, action) => {
      const { lang } = action.payload;
      if (!(lang in state.sessionRuntime)) {
        let socket = io(`http://${window.location.hostname}:4000`);
        socket.emit("spawn", state.sessionId, lang);
        state.sessionRuntime[lang] = socket;
      }
    },
    setRepo: (state, action) => {
      const { reponame, username } = action.payload;
      state.reponame = reponame;
      state.username = username;
    },
    markClip: (state, action) => {
      let { id } = action.payload;
      if (state.clip === id) {
        state.clip = undefined;
      } else {
        state.clip = id;
      }
    },
    ...podReducers,
    ...exportReducers,
    ...runtimeReducers,
    resetKernelStatus: (state, action) => {
      Object.entries(state.kernels).forEach(([k, v]) => {
        v.status = null;
      });
    },

    toggleRaw: (state, action) => {
      const id = action.payload;
      state.pods[id].raw = !state.pods[id].raw;
    },
    addPodQueue: (state, action) => {
      state.queue.push(action.payload);
    },
    addError: (state, action) => {
      state.error = action.payload;
    },
    clearError: (state, action) => {
      state.error = null;
    },
  },
  extraReducers: {
    ...queueReducers,
    ...loadReducers,
    ...remoteReducers,
    ...wsReducers,
  },
});

function isPodQueueAction(action) {
  const types = [
    repoSlice.actions.addPod.type,
    repoSlice.actions.deletePod.type,
  ];
  return types.includes(action.type);
}

// placeholder for now
export const userSlice = createSlice({
  name: "user",
  initialState: {
    id: null,
    name: null,
  },
  reducers: {},
});

export default configureStore({
  reducer: {
    repo: repoSlice.reducer,
    users: userSlice.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(podQueueMiddleware, wsMiddleware),
});
