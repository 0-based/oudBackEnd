const { albumsController } = require('../../../src/controllers');
const mockingoose = require('mockingoose').default;
let mongoose = require('mongoose');
const requestMocks = require('../../utils/request.mock');
let { Album, Track, Artist, Genre } = require('../../../src/models');
let fs = require('fs').promises;
let { trackService } = require('../../../src/services');

artistIds = [
  '5e6c8ebb8b40fc5508fe8b32',
  '5e6c8ebb8b40fc6608fe8b32',
  '5e6c8ebb8b40fc7708fe8b32'
];
albumIds = [
  '5e6c8ebb8b40fc5508fe8b32',
  '5e6f6a7fac1d6d06f40706f2',
  '5e6c8ebb8b40fc5518fe8b32'
];

describe('Albums Controller', () => {
  let req;
  let res;
  let next;
  let album;
  let albums;
  beforeEach(() => {
    album = new Album({
      album_type: 'single',
      album_group: 'compilation',
      artists: artistIds,
      genres: ['5e6c8ebb8b40fc5518fe8b32'],
      image: 'example.jpg',
      name: 'The Begining',
      release_date: '12-06-1999',
      tracks: [albumIds[0]]
    });
    albums = [album, album];
    req = { params: {}, query: {}, body: {} };
    res = requestMocks.mockResponse();
    next = jest.fn();
    mongoose.Types.ObjectId = jest.fn();
  });
  describe('get Album', () => {
    it('Should return the album with the given ID with status code of 200', async () => {
      mockingoose(Album)
        .toReturn(album, 'findOne')
        .toReturn([{ _id: album._id, tracks: 2 }], 'aggregate');
      req.params.id = albumIds[0];
      req.user = { _id: artistIds[0] };
      await albumsController.getAlbum(req, res, next);
      expect(res.json.mock.calls[0][0]).toMatchObject(album);
      expect(res.status.mock.calls[0][0]).toBe(200);
    });
    it('Should throw an error with status code 404', async () => {
      mockingoose(Album).toReturn(null, 'findOne');
      req.params.id = "a valid ID which doens't exist";
      await albumsController.getAlbum(req, res, next);
      expect(next.mock.calls[0][0].statusCode).toBe(404);
    });
  });
  describe('getAlbums', () => {
    it("Should return list of albums with the given ID's with status code 200", async () => {
      mockingoose(Album).toReturn(albums, 'find');
      req.query.ids = albumIds;
      await albumsController.getAlbums(req, res, next);
      result = res.json.mock.calls;
      expect(res.json.mock.calls[0][0]).toHaveProperty('albums');
      expect(res.status.mock.calls[0][0]).toBe(200);
    });
    it("Should return an array of nulls if none of the ID's matches an album", async () => {
      mockingoose(Album).toReturn([], 'find');
      req.query.ids = ['one valid ID', 'another valid ID'];
      await albumsController.getAlbums(req, res, next);
      expect(res.json.mock.calls[0][0].albums).toMatchObject([null, null]);
    });
    it("Should return the same result for the same ID (and null for invalid ID's)", async () => {
      mockingoose(Album)
        .toReturn([album], 'find')
        .toReturn([{ _id: album._id, tracks: 3 }], 'aggregate');
      req.query.ids = [
        album._id,
        album._id,
        'one existing ID',
        ' another valid ID'
      ];
      await albumsController.getAlbums(req, res, next);
      result = res.json.mock.calls;
      expect(result[0][0].albums[0]).toEqual(result[0][0].albums[1]);
      expect(result[0][0].albums[2]).toEqual(result[0][0].albums[3]);
      expect(result[0][0].albums[2]).toEqual(null);
    });
  });
  describe('findAlbumTracks', () => {
    it('Should return the tracks of the album with the given Id in a paging object with status code 200', async () => {
      mockingoose(Album).toReturn(album, 'findOne');
      req.params.id = album._id;
      req.query = { limit: 20, offset: 0 };
      req.user = { _id: artistIds[0] };
      await albumsController.findAlbumTracks(req, res, next);
      expect(res.json.mock.calls[0][0]).toHaveProperty('items');
      expect(res.status.mock.calls[0][0]).toBe(200);
    });
    it('Should throw an error with status code 404 if the album is not found', async () => {
      mockingoose(Album).toReturn(null, 'findOne');
      req.params.id = "valid id that doesn't exist";
      req.query = { limit: 20, offset: 0 };
      await albumsController.findAlbumTracks(req, res, next);
      expect(next.mock.calls[0][0].statusCode).toBe(404);
    });
  });
  describe('deleteAblum', () => {
    it('Should return the deleted album with status code 200 if the album was found', async () => {
      mockingoose(Album)
        .toReturn(album, 'findOne')
        .toReturn(album, 'findOneAndDelete')
        .toReturn([{ tracks: 3 }], 'aggregate');
      req.user = { _id: album.artists[0]._id };
      req.params.id = album._id;
      fs.unlink = jest.fn();
      trackService.deleteTrack = jest.fn();
      await albumsController.findAndDeleteAlbum(req, res, next);
      expect(res.status.mock.calls[0][0]).toBe(200);
      expect(res.json.mock.calls[0][0]).toMatchObject(album);
    });
    it('Should throw an error with status code 404 if the album is not found', async () => {
      mockingoose(Album)
        .toReturn(null, 'findOne')
        .toReturn(null, 'findOneAndDelete');
      req.user = { _id: album.artists[0]._id };
      req.params.id = album._id;
      await albumsController.findAndDeleteAlbum(req, res, next);
      expect(next.mock.calls[0][0].statusCode).toBe(404);
    });
    it("Should throw an error with status code 403 if the user is not the album's main artist", async () => {
      mockingoose(Album)
        .toReturn(album, 'findOne')
        .toReturn(album, 'findOneAndDelete');
      req.user = { _id: album.artists[1]._id };
      req.params.id = album._id;
      await albumsController.findAndDeleteAlbum(req, res, next);
      expect(next.mock.calls[0][0].statusCode).toBe(403);
    });
  });
  describe('updateAlbum', () => {
    it('Should return the album updated with status code 200', async () => {
      mockingoose(Album)
        .toReturn(album, 'findOne')
        .toReturn(album, 'findOneAndUpdate')
        .toReturn([{ tracks: 3 }], 'aggregate');
      req.params.id = album._id;
      req.user = { _id: album.artists[0]._id };
      await albumsController.updateAlbum(req, res, next);
      expect(res.status.mock.calls[0][0]).toBe(200);
      expect(res.json.mock.calls[0][0]).toMatchObject(album);
    });
    it('Should throw an error with status code 404 if the album was not found', async () => {
      mockingoose(Album)
        .toReturn(null, 'findOne')
        .toReturn(null, 'findOneAndUpdate');
      req.params.id = album._id;
      req.user = { _id: album.artists[0]._id };
      await albumsController.updateAlbum(req, res, next);
      expect(next.mock.calls[0][0].statusCode).toBe(404);
    });
    it("Should throw an error with status code 403 if the artist is not the album's main artist", async () => {
      mockingoose(Album)
        .toReturn(album, 'findOne')
        .toReturn(album, 'findOneAndUpdate');
      req.params.id = album._id;
      req.user = { _id: album.artists[1]._id }; // the right artist is artist[0]
      await albumsController.updateAlbum(req, res, next);
      expect(next.mock.calls[0][0].statusCode).toBe(403);
    });
    it('Should throw an error with status code 403 if the album is released', async () => {
      album.released = true;
      mockingoose(Album)
        .toReturn(album, 'findOne')
        .toReturn(album, 'findOneAndUpdate');
      req.params.id = album._id;
      req.user = { _id: album.artists[0]._id }; // the right artist is artist[0]
      await albumsController.updateAlbum(req, res, next);
      expect(next.mock.calls[0][0].statusCode).toBe(403);
    });
    it("Should throw an error with status code 400 if the genres doesn't exist", async () => {
      mockingoose(Album)
        .toReturn(album, 'findOne')
        .toReturn(album, 'findOneAndUpdate');
      mockingoose(Genre).toReturn([], 'find');
      req.params.id = album._id;
      req.user = { _id: album.artists[0]._id }; // the right artist is artist[0]
      req.body = { genres: ['lol xD'] };
      await albumsController.updateAlbum(req, res, next);
      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });
  });
  describe('createAlbum', () => {
    it('Should return the created album with staus code 200', async () => {
      req.body = {
        album_type: 'single',
        album_group: 'compilation',
        artists: artistIds,
        genres: ['5e6c8ebb8b40fc5518fe8b32'],
        image: 'example.jpg',
        name: 'The Begining',
        release_date: '12-06-1999',
        tracks: [albumIds[0]]
      };
      req.user = { _id: artistIds[0] };
      mockingoose(Album).toReturn(album, 'save');
      mockingoose(Artist).toReturn(album.artists, 'find');
      mockingoose(Genre).toReturn(album.genres, 'find');
      await albumsController.createAlbum(req, res, next);
      expect(res.status.mock.calls[0][0]).toBe(200);
      expect(res.json.mock.calls[0][0]).toMatchObject({
        _id: album._id,
        album_type: album.album_type
      });
    });
    it("Should throw an error with status code 400 if the artists doesn't exist", async () => {
      req.body = {
        album_type: 'single',
        album_group: 'compilation',
        artists: artistIds,
        genres: ['5e6c8ebb8b40fc5518fe8b32'],
        image: 'example.jpg',
        name: 'The Begining',
        release_date: '12-06-1999',
        tracks: [albumIds[0]]
      };
      req.user = { _id: artistIds[0] };
      mockingoose(Album).toReturn(album, 'save');
      mockingoose(Artist).toReturn([], 'find');
      mockingoose(Genre).toReturn(album.genres, 'find');
      await albumsController.createAlbum(req, res, next);
      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });
    it("Should throw an error with status code 400 if the genres doesn't exist", async () => {
      req.body = {
        album_type: 'single',
        album_group: 'compilation',
        artists: artistIds,
        genres: ['5e6c8ebb8b40fc5518fe8b32'],
        image: 'example.jpg',
        name: 'The Begining',
        release_date: '12-06-1999',
        tracks: [albumIds[0]]
      };
      req.user = { _id: artistIds[0] };
      mockingoose(Album).toReturn(album, 'save');
      mockingoose(Artist).toReturn(album.artists, 'find');
      mockingoose(Genre).toReturn([], 'find');
      await albumsController.createAlbum(req, res, next);
      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });
  });
  describe('setImage', () => {
    it('Should return album with new path with status code 200', async () => {
      mockingoose(Album)
        .toReturn(album, 'findOne')
        .toReturn(album, 'save')
        .toReturn([{ tracks: 3 }], 'aggregate');
      req.user = { _id: album.artists[0]._id };
      req.params.id = album._id;
      req.file = {
        path: 'lol.jpg'
      };
      fs.unlink = jest.fn();
      await albumsController.setImage(req, res, next);
      expect(res.json.mock.calls[0][0]).toMatchObject({
        _id: album._id,
        album_type: album.album_type
      });
      expect(res.status.mock.calls[0][0]).toBe(200);
    });
    it("Should throw an error with status code 403 if the user is not the album's main artist", async () => {
      mockingoose(Album)
        .toReturn(album, 'findOne')
        .toReturn(album, 'save');
      req.user = { _id: album.artists[1]._id };
      req.params.id = album._id;
      req.file = {
        path: 'lol.jpg'
      };
      fs.unlink = jest.fn();
      await albumsController.setImage(req, res, next);
      expect(next.mock.calls[0][0].statusCode).toBe(403);
    });
    it('Should throw an error with status code 403 if album is released', async () => {
      album.released = true;
      mockingoose(Album)
        .toReturn(album, 'findOne')
        .toReturn(album, 'save');
      req.user = { _id: album.artists[0]._id };
      req.params.id = album._id;
      req.file = {
        path: 'lol.jpg'
      };
      fs.unlink = jest.fn();
      await albumsController.setImage(req, res, next);
      expect(next.mock.calls[0][0].statusCode).toBe(403);
    });
    it('Should throw an error with status code 404 if the album is not found', async () => {
      mockingoose(Album)
        .toReturn(null, 'findOne')
        .toReturn(null, 'save');
      req.user = { _id: album.artists[1]._id };
      req.params.id = album._id;
      req.file = {
        path: 'lol.jpg'
      };
      fs.unlink = jest.fn();
      await albumsController.setImage(req, res, next);
      expect(next.mock.calls[0][0].statusCode).toBe(404);
    });
  });
  describe('newTrack', () => {
    it('Should return the updated album with status code 200', async () => {
      mockingoose(Album)
        .toReturn(album, 'findOne')
        .toReturn(album, 'save')
        .toReturn([{ _id: album._id, tracks: 2 }], 'aggregate');
      mockingoose(Track).toReturn(album.tracks[0], 'save');
      mockingoose(Artist).toReturn(album.artists, 'find');
      req.params.id = album._id;
      req.user = { _id: album.artists[0]._id }; // the right artist is artist[0]
      req.body = { name: album.name, artists: album.artists };
      await albumsController.newTrack(req, res, next);
      expect(res.status.mock.calls[0][0]).toBe(200);
      expect(res.json.mock.calls[0][0]).toMatchObject({
        _id: album._id,
        album_type: album.album_type
      });
    });
    it('Should throw an error with status code 404 if the album was not found', async () => {
      mockingoose(Album)
        .toReturn(null, 'findOne')
        .toReturn(null, 'save');
      mockingoose(Track).toReturn(album.tracks[0], 'save');
      req.params.id = album._id;
      req.user = { _id: album.artists[0]._id }; // the right artist is artist[0]
      req.body = { name: album.name, artists: album.artists };
      await albumsController.newTrack(req, res, next);
      expect(next.mock.calls[0][0].statusCode).toBe(404);
    });
    it("Should throw an error with status code 403 if the user is not the album's main artist", async () => {
      mockingoose(Album)
        .toReturn(album, 'findOne')
        .toReturn(album, 'save');
      mockingoose(Track).toReturn(album.tracks[0], 'save');
      req.params.id = album._id;
      req.user = { _id: album.artists[1]._id }; // the right artist is artist[0]
      req.body = { name: album.name, artists: album.artists };
      await albumsController.newTrack(req, res, next);
      expect(next.mock.calls[0][0].statusCode).toBe(403);
    });
    it('Should throw an error with status code 403 if the album is released', async () => {
      album.released = true;
      mockingoose(Album)
        .toReturn(album, 'findOne')
        .toReturn(album, 'save');
      mockingoose(Track).toReturn(album.tracks[0], 'save');
      req.params.id = album._id;
      req.user = { _id: album.artists[0]._id }; // the right artist is artist[0]
      req.body = { name: album.name, artists: album.artists };
      await albumsController.newTrack(req, res, next);
      expect(next.mock.calls[0][0].statusCode).toBe(403);
    });
    it("Should throw an error with status code 400 if the artists doesn't exist", async () => {
      mockingoose(Album)
        .toReturn(album, 'findOne')
        .toReturn(album, 'save');
      mockingoose(Track).toReturn(album.tracks[0], 'save');
      mockingoose(Artist).toReturn([], 'find');
      req.params.id = album._id;
      req.user = { _id: album.artists[0]._id }; // the right artist is artist[0]
      req.body = { name: album.name, artists: album.artists };
      await albumsController.newTrack(req, res, next);
      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });
  });
});
