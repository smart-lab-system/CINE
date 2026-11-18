

/* Structure of class Node is
class Node
{
    int data;
    Node next;

    Node(int d)
    {
        data = d;
        next = null;
    }
}*/

class Solution {
    // Function to check whether the list is palindrome.
    static boolean isPalindrome(Node head) {
        Node slow = head;
        Node fast = head;
        Node current=head;
        
        while(fast!=null && fast.next!=null){
            slow=slow.next;
            fast=fast.next.next;
        }
        Node prev=null;
        Node current2=slow;
        while(current2!=null){
            Node nextNode = current2.next;
            current2.next=prev;
            prev=current2;
            current2=nextNode;
        }
        
        while(prev!=null && current!=slow && prev.data==current.data){
            prev=prev.next;
            current=current.next;
        }
        if(prev!=null && current!=slow){
            return false;
        }
        return true;
    }
}