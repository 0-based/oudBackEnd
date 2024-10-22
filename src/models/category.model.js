const mongoose = require('mongoose');
const mongoose_fuzzy_searching = require('mongoose-fuzzy-searching');
const searchPlugin = require('./search.plugin');
const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'category should have a name'],
      minlength: 3,
      maxlength: 20,
      trim: true,
      unique: [true, 'this category name  already exits']
    },
    icon: {
      type: String,
      match: /.(png|jpg|jpeg)$/,
      required: [true, 'the category should have an icon'],
      trim: true
    },
    playlists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Playlist' }]
  },
  {
    toJSON: {
      virtuals: true
    },
    toObject: {
      virtuals: true
    }
  }
);

categorySchema.virtual('type').get(function() {
  return 'category';
},
{
  toJSON: {
    virtuals: true
  },
  toObject: {
    virtuals: true
  }
});


categorySchema.plugin(mongoose_fuzzy_searching, { fields: [{ name: 'name', minSize: 1 }] });
categorySchema.plugin(searchPlugin, 'name');

const Category = mongoose.model('Category', categorySchema);
module.exports = { Category, categorySchema };
