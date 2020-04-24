const { Player } = require('../models/player.model');
const { Track } = require('../models/track.model');
const { Ad } = require('../models/ad.model');

/**
 * Get `player` with the given `userId`
 *
 * @function
 * @public
 * @async
 * @author Abdelrahman Tarek
 * @param {String} userId User ID
 * @param {Object} [ops] Options Object
 * @param {Boolean} [ops.populate=true] if true will populate (Default `true`)
 * @param {String} [ops.link=undefined] the link of the audio url host if not passed do not return `audioUrl` if populate is false nothing happens
 * @returns {Document} `player`
 * @returns {null} if `player` is not found
 * @summary Get `player` with the given `userId`
 */
const getPlayer = async (userId, ops = { populate: true, link: undefined }) => {
  let player;

  if (ops && ops.populate) {
    player = await Player.findOne({ userId: userId })
      .populate({
        path: 'item',
        select: '+audioUrl -__v',
        populate: {
          path: 'artists album',
          select: '_id images displayName id name image album_type'
        }
      })
      .populate('device')
      .lean({ virtuals: true });

    if (player && player.item && player.item.audioUrl) {
      if (ops.link) {
        // if it is not a url
        // Add host link
        if (!player.item.audioUrl.startsWith('http')) {
          let audio = player.item.audioUrl.replace(/\\/g, "/"); // convert \ to /
          audio = audio.split('/');
          player.item.audioUrl = ops.link + audio[audio.length - 1];
        }
      } else
        player.item.audioUrl = undefined;
    }
  } else player = await Player.findOne({ userId: userId });

  return player;
};

/**
 * Get currently playing track with its context
 *
 * @function
 * @public
 * @async
 * @author Abdelrahman Tarek
 * @param {String} userId User ID
 * @param {Object} [ops] Options Object
 * @param {String} [ops.link=undefined] the link of the audio url host if not passed do not return `audioUrl`
 * @returns {Object} `currentlyPlaying` if `player` is found and `player.item` is not `null` \
 * `currentlyPlaying.item` is the track \
 * `currentlyPlaying.context` is the track `context` \
 * @returns {null} `null` if item is null or player is not found
 * @summary Get Currently Playing
 */
const getCurrentlyPlaying = async (userId, ops = { link: undefined }) => {
  let currentlyPlaying = await Player.findOne({ userId: userId })
    .populate({
      path: 'item',
      select: '+audioUrl -__v',
      populate: {
        path: 'artists album',
        select: '_id images displayName id name image album_type'
      }
    })
    .lean({ virtuals: true });
  if (currentlyPlaying && !currentlyPlaying.item) {
    currentlyPlaying = null;
  }

  if (currentlyPlaying && currentlyPlaying.item && currentlyPlaying.item.audioUrl) {
    if (ops && ops.link) {
      // if it is not a url
      // Add host link
      if (!currentlyPlaying.item.audioUrl.startsWith('http')) {
        let audio = currentlyPlaying.item.audioUrl.replace(/\\/g, "/"); // convert \ to /
        audio = audio.split('/');
        currentlyPlaying.item.audioUrl = ops.link + audio[audio.length - 1];
      }

    } else
      currentlyPlaying.item.audioUrl = undefined;
  }

  return currentlyPlaying;
};

/**
 * Create player with the given userId
 *
 * @function
 * @public
 * @async
 * @author Abdelrahman Tarek
 * @param {String} userId User ID
 * @throws `MongooseError`
 * @returns {Document} `newPlayer` if player is created
 * @summary Create Player
 */
const createPlayer = async userId => {
  const newPlayer = await Player.create({
    userId: userId
  });

  return newPlayer;
};

/**
 * Add `track` to `player`
 *
 * @function
 * @public
 * @author Abdelrahman Tarek
 * @param {Document} player player
 * @param {String} track track ID
 * @param {Object} [context] context object
 * @param {String} [context.type] context type
 * @param {String} [context.id] context id
 * @description assign player.item to track, player.progressMs to 0, player.currentlyPlayingType to track \
 * and if context and context.type is defined \
 * assign player.context to context \
 * increase track views
 * @summary Add track to player
 */
const addTrackToPlayer = async (
  player,
  track,
  context = { type: undefined, id: undefined }
) => {
  // increase track views
  Track.findByIdAndUpdate({ _id: track }, { $inc: { views: 1 } }).exec();
  // handle ads counter
  if (player.adsCounter === null) player.adsCounter = undefined; // fix converting undefined to null in update query
  if (player.adsCounter !== undefined && player.item !== track) {
    player.adsCounter++;
  }

  if (player.adsCounter > 3) {
    // play ad
    player.adsCounter = 0;
    player.progressMs = 0;
    player.isPlaying = true;
    player.currentlyPlayingType = 'ad';
    player.itemModel = 'Ad';
    player.context = { type: 'unknown' };
    player.actions = {
      interrupting_playback: true,
      pausing: true,
      resuming: true,
      seeking: true,
      skipping_next: true,
      skipping_prev: true,
      toggling_repeat_context: true,
      toggling_shuffle: true,
      toggling_repeat_track: true,
      transferring_playback: true
    };
    // play random ad
    const ad = await Ad.aggregate([{ $sample: { size: 1 } }]);
    player.item = ad.length ? ad[0]._id : null;
  } else {
    // play the track
    if (player.item !== track) {
      const { notifyService } = require('../services');
      notifyService.listenToTrack(player.userId, track);
    }
    player.item = track;
    player.progressMs = 0;
    player.isPlaying = true;
    player.currentlyPlayingType = 'track';
    player.itemModel = 'Track';
    player.actions = null;
    // add context to player
    if (context && context.type) {
      player.context = context;
    }
  }
};

/**
 * Start playing from given offset
 *
 * @function
 * @public
 * @async
 * @author Abdelrahman Tarek
 * @param {Document} player Player
 * @param {Document} queue Queue
 * @param {Object} offset Offset object
 * @param {Number} [offset.position] Offset postiton
 * @param {String} [offset.uri] Offset track uri to start from (oud:track:{trackId})
 * @param {Array<String>} queues queues IDs array
 * @description if offset.position is passed \
 * assign player.item to track in the queue with the given position if the position is < queue length \
 * else assign player.item the first track in the queue \
 * else if offset.uri is passed assign player.item to the passed track id if found \
 * else assign player.item to the first track in the queue
 * @summary Start playing from given offset
 * @returns {Document} player
 */
const startPlayingFromOffset = async (player, queue, offset, queues) => {
  const queueService = require('./queue.service');
  if (!queue) {
    queue = await queueService.getQueueById(queues[0], { selectDetails: true });
  }

  if (!queue) return player;

  if (offset.position !== undefined) {
    // shuffle mode
    if (queue.shuffleList && queue.shuffleList.length) {
      if (queue.shuffleList.length <= offset.position) {
        queue.shuffleIndex = 0;
      } else {
        queue.shuffleIndex = offset.position;
      }

      queue.currentIndex = queue.shuffleList[queue.shuffleIndex]; // set current index
    } else {
      // normal mode
      if (queue.tracks.length <= offset.position) {
        queue.currentIndex = 0;
      } else {
        queue.currentIndex = offset.position;
      }
    }
  } else if (offset.uri) {
    const trackId = offset.uri.split(':')[2];
    let pos = await queueService.getTrackPosition(queues[0], trackId);
    // shuffle mode
    if (queue.shuffleList && queue.shuffleList.length) {
      pos = queue.shuffleList.indexOf(pos); // get position in queue shuffle list
      if (pos === -1) {
        queue.shuffleIndex = 0;
      } else {
        queue.shuffleIndex = pos;
      }

      queue.currentIndex = queue.shuffleList[queue.shuffleIndex]; // set current index
    } else {
      if (pos === -1) {
        queue.currentIndex = 0;
      } else {
        queue.currentIndex = pos;
      }
    }
  }

  return player;
};

/**
 * Chnage player progress
 *
 * @function
 * @public
 * @async
 * @author Abdelrahman Tarek
 * @param {Document} player Player
 * @param {Number} progressMs progress in m Second
 * @param {Array<String>} queues queues IDs array
 * @param {Document} [track] Currently playing track
 * @param {Document} [queue] Currently playing queue
 * @description Set player.progressMs to the given progressMs and if progressMs >= track duration (go next if repeat state != track else start the track from zero second)
 * @summary Chnage player progress
 * @returns {Document} player
 */
const changePlayerProgress = async (
  player,
  progressMs,
  queues,
  track = null,
  queue = null
) => {
  const queueService = require('./queue.service');
  player.progressMs = progressMs;

  if (!track) track = await Track.findById(player.item);

  // if position >= track duration go to next
  if (track && progressMs >= track.duration) {
    if (player.repeatState !== 'track') {
      if (!queue)
        queue = await queueService.getQueueById(queues[0], {
          selectDetails: true
        });

      if (!queue || !queue.tracks || !queue.tracks.length) {
        return null;
      }
      // go next
      queueService.goNext(queue, player, queues);

      await queue.save(); // save the queue
    } else player.progressMs = 0;
  }

  return player;
};

/**
 * Add Device to player
 *
 * @function
 * @public
 * @async
 * @author Abdelrahman Tarek
 * @param {Document} player PLayer
 * @param {String} deviceId Device ID
 * @description if found a device with the given deviceId \
 * assign player.device to deviceId and return player \
 * else \
 * return null
 * @summary Add Device to player
 * @returns {Document} player if found a device with deviceId
 * @returns {Null} if not found a device with deviceId
 */
const addDeviceToPlayer = async (player, deviceId) => {
  const deviceService = require('./device.service');
  const device = await deviceService.getDevice(deviceId);
  if (!device) {
    return null;
  }
  player.device = deviceId;

  return player;
};

/**
 * Set `player` to Default
 *
 * @function
 * @public
 * @author Abdelrahman Tarek
 * @param {Document} player Player
 * @description Set \
 * player.item = null \
 * player.context = { type: 'unknown' } \
 * player.progressMs = null \
 * player.shuffleState = false \
 * player.repeatState = 'off' \
 * player.isPlaying = false \
 * player.currentlyPlayingType = 'unknown'
 * @summary Set `player` to Default
 */
const setPlayerToDefault = player => {
  player.item = null;
  player.context = { type: 'unknown' };
  player.progressMs = null;
  player.shuffleState = false;
  player.repeatState = 'off';
  player.isPlaying = false;
  player.currentlyPlayingType = 'unknown';
  player.itemModel = 'Track';
  player.actions = undefined;
};

module.exports = {
  getPlayer,
  getCurrentlyPlaying,
  createPlayer,
  addTrackToPlayer,
  startPlayingFromOffset,
  changePlayerProgress,
  addDeviceToPlayer,
  setPlayerToDefault,
  addDeviceToPlayer
};
