

class Solution {
    // Function to count the frequency of all elements from 1 to N in the array.
    public List<Integer> frequencyCount(int[] arr) {
        int n = arr.length;
        List<Integer> counts = new ArrayList<>(n+1);
        HashMap <Integer, Integer> hash = new HashMap <Integer, Integer>();
        
        // counting frequencies using HashMap
        for(int i=0; i<n; i++){
            if(hash.containsKey(arr[i])){
                hash.put(arr[i], hash.get(arr[i])+1);
            }else{
                hash.put(arr[i], 1);
            }
            // hash.put(arr[i], hash.getOrDefault(arr[i], 0)+1);
        }
        
        // storing values in List
        for(int i=0; i<n; i++){
            if(hash.containsKey(i+1)){
                counts.add(hash.get(i+1));
            }else{
                counts.add(0);
            }
        }
        
        return counts;
    }
}