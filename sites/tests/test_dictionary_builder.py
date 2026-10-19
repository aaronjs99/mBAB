import importlib.util
from pathlib import Path
import sys
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/build-dictionary.py"
spec=importlib.util.spec_from_file_location("dictionary_builder",SCRIPT)
builder=importlib.util.module_from_spec(spec)
sys.modules[spec.name]=builder
spec.loader.exec_module(builder)


def sources():
    return {name:"" for part in ("noun","verb","adj","adv") for name in (f"data.{part}",f"index.{part}",f"{part}.exc")}

class DictionaryTests(unittest.TestCase):
    def test_gloss_preserves_semicolons_inside_examples_and_quoted_definition_terms(self):
        self.assertEqual(builder.parse_gloss('a phrase called "an idiom"; two parts; "I went; I saw"; "a second example"'), ('a phrase called "an idiom"; two parts', ["I went; I saw", "a second example"]))

    def test_gloss_keeps_attribution_and_does_not_repair_malformed_source_quotes(self):
        self.assertEqual(builder.parse_gloss('a warning; "Vengeance is mine; I will repay"--Romans 12:19'), ('a warning', ['"Vengeance is mine; I will repay"--Romans 12:19']))
        raw='a warning; "an unclosed example'
        self.assertEqual(builder.parse_gloss(raw),(raw,[]))

    def test_dictionary_keeps_all_senses_in_index_order_and_phrases(self):
        files=sources()
        files['data.noun']='00000001 00 n 02 Wise_Guy 0 sage 0 000 | an astute person; "a wise guy"\n00000002 00 n 01 wise_guy 0 000 | a later meaning\n00000003 00 n 01 wise_guy 0 000 | an early meaning\n'
        files['index.noun']='wise_guy n 3 0 3 0 00000003 00000001 00000002\n'
        entries,exceptions=builder.compile_dictionary(files)
        self.assertEqual(list(entries),['wise guy'])
        self.assertEqual([sense['definition'] for sense in entries['wise guy']],['an early meaning','an astute person','a later meaning'])
        self.assertEqual(entries['wise guy'][1]['examples'],['a wise guy'])
        self.assertEqual(entries['wise guy'][1]['synonyms'],['sage'])
        self.assertEqual(exceptions, {pos:{} for pos in ['noun','verb','adjective','adverb']})

    def test_adjective_satellite_normalization_deduplicates_synonyms_and_preserves_punctuation(self):
        files=sources()
        files['data.adj']="00000001 00 s 03 God's-fearing(a) 0 pious(p) 0 pious(ip) 0 000 | reverent\n"
        files['index.adj']="god's-fearing a 1 0 1 0 00000001\n"
        entries,_=builder.compile_dictionary(files)
        self.assertEqual(entries["god's-fearing"],[{'pos':'adjective','definition':'reverent','examples':[],'synonyms':['pious']}])

    def test_morphology_exceptions_remain_pos_specific_and_ordered(self):
        files=sources()
        files['noun.exc']='axes ax axis\naxes axis\n'
        files['verb.exc']='axes axe\n'
        _,exceptions=builder.compile_dictionary(files)
        self.assertEqual(exceptions['noun']['axes'],['ax','axis'])
        self.assertEqual(exceptions['verb']['axes'],['axe'])

    def test_index_missing_synset_and_wrong_pos_fail_loudly(self):
        files=sources(); files['index.noun']='word n 1 0 1 0 00000001\n'
        with self.assertRaises(ValueError): builder.compile_dictionary(files)
        files=sources(); files['data.noun']='00000001 00 v 01 word 0 000 | a meaning\n'
        with self.assertRaises(ValueError): builder.compile_dictionary(files)

    def test_sharding_is_deterministic_and_manifest_hashes_match_exact_bytes(self):
        entries={'wisdom':[{'pos':'noun','definition':'knowledge','examples':[],'synonyms':[]}],"'hood":[{'pos':'noun','definition':'neighborhood','examples':[],'synonyms':[]}]}
        exceptions={pos:{} for pos in ['noun','verb','adjective','adverb']}
        first=builder.serialize_dictionary(entries,exceptions,b'license\n')
        second=builder.serialize_dictionary(dict(reversed(list(entries.items()))),exceptions,b'license\n')
        self.assertEqual(first,second)
        import hashlib,json
        manifest=json.loads(first['manifest.json'])
        self.assertEqual(set(manifest['letters']),{'w','other'})
        for info in manifest['letters'].values():
            data=first[info['file']]
            self.assertEqual(info['sha256'],hashlib.sha256(data).hexdigest())
            self.assertEqual(info['bytes'],len(data))

if __name__=='__main__':unittest.main()
